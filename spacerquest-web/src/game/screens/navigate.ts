import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { validateLaunch, startTravel, calculateLiftOffFee } from '../systems/travel.js';
import { CORE_SYSTEM_NAMES } from '../constants.js';

// Pending launch state: after validation passes, we show the fee and wait for Y/N
interface PendingLaunch {
  destinationSystemId: number;
  fuelRequired: number;
  liftOffFee: number;
  feeWaived: boolean;
  waiveReason: string;
}

// SP.LIFT.S lines 76–109: bribe negotiation state machine
interface PendingBribe {
  step: 'ask' | 'offer' | 'type';
  threshold: number;   // random 1–10, generated when player says Y to bribe
  offerAmount: number; // amount (in thousands) once threshold is met
}

const pendingLaunches = new Map<string, PendingLaunch>();
const pendingBribes = new Map<string, PendingBribe>();

// SP.LIFT.S lines 30, 67: player has a valid launch contract
function hasActiveContract(missionType: number, cargoPods: number): boolean {
  return missionType === 1 || missionType === 3 || missionType === 4 || missionType === 9 || cargoPods >= 1;
}

function destinationPromptOutput(currentSystem: number, fuel: number): string {
  return `\r\n\x1b[36;1m_________________________________________\x1b[0m\r\n\x1b[33;1m      NAVIGATION CONTROL                   \x1b[0m\r\n\x1b[36;1m_________________________________________\x1b[0m\r\n\r\n\x1b[32mCurrent Location:\x1b[0m System ${currentSystem}\r\n\x1b[32mFuel Remaining:\x1b[0m ${fuel} units\r\n\r\nEnter destination system ID to travel to.\r\nOr enter 0 or leave blank to abort.\r\n\r\n\x1b[32m:\x1b[0m${currentSystem} Navigation:\x1b[32m: Destination System ID:\x1b[0m\r\n> `;
}

export const NavigateScreen: ScreenModule = {
  name: 'navigate',
  render: async (characterId: string): Promise<ScreenResponse> => {
    // Clear any pending state from previous visit
    pendingLaunches.delete(characterId);
    pendingBribes.delete(characterId);

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true }
    });

    if (!character) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    // SP.LIFT.S line 67: if q1<1 → goto bribe
    if (!hasActiveContract(character.missionType, character.cargoPods)) {
      pendingBribes.set(characterId, { step: 'ask', threshold: 0, offerAmount: 0 });
      const output = `\r\n\x1b[36;1m${'-'.repeat(45)}\x1b[0m\r\n\x1b[33;1mMission Control Officer:\x1b[0m\r\n\x1b[36;1m${'-'.repeat(45)}\x1b[0m\r\n\r\n\x1b[31m  Valid contract required for launch clearance!\x1b[0m\r\n\r\n\x1b[33m[Cr:${character.creditsHigh ? character.creditsHigh + ',' : ''}${character.creditsLow}:]: Attempt a bribe? (Y)/[N]:\x1b[0m `;
      return { output };
    }

    return { output: destinationPromptOutput(character.currentSystem, character.ship?.fuel || 0) };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    // SP.LIFT.S lines 76–109: handle bribe flow first
    const bribe = pendingBribes.get(characterId);
    if (bribe) {
      return handleBribe(characterId, input, bribe);
    }

    // Check if we're waiting for fee confirmation
    const pending = pendingLaunches.get(characterId);
    if (pending) {
      return handleFeeConfirmation(characterId, input, pending);
    }

    const destStr = input.trim().toUpperCase();

    if (!destStr || destStr === '0' || destStr === 'M' || destStr === 'Q' || destStr === 'ABORT') {
      return { output: '\x1b[2J\x1b[H\x1b[33mNavigation aborted.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const destinationSystemId = parseInt(destStr, 10);
    if (isNaN(destinationSystemId) || destinationSystemId < 1) {
      return { output: '\r\n\x1b[31mInvalid system ID. Please enter a valid number or M to return to Main Menu.\x1b[0m\r\n> ' };
    }

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true, portOwnership: true, allianceMembership: true }
    });

    if (!character) {
        return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    if (character.currentSystem === destinationSystemId) {
        return { output: '\r\n\x1b[33mYou are already in system ' + destinationSystemId + '.\x1b[0m\r\n> ' };
    }

    const validation = await validateLaunch(characterId, destinationSystemId);

    if (!validation.valid) {
        return {
            output: '\r\n\x1b[31mLaunch Aborted!\x1b[0m\r\n' + validation.errors.map(e => `  - ${e}`).join('\r\n') + '\r\n\r\nPress Enter to return to Main Menu.',
            nextScreen: 'main-menu'
        };
    }

    // Calculate lift-off fee (SP.LIFT.S lines 127-160)
    const ship = character.ship!;
    const scoreLevel = Math.floor(character.score / 150); // sc = floor(score/150)
    const currentSystem = character.currentSystem;

    // Check fee waiver conditions
    const isHomePort = character.portOwnership?.systemId === currentSystem;

    let feeWaived = false;
    let waiveReason = '';

    if (isHomePort) {
      feeWaived = true;
      waiveReason = "Oh, It's you, Sir!...Have a safe trip!";
    }

    // Check alliance discount (SP.LIFT.S lines 136-137)
    let isAllyPort = false;
    if (!feeWaived && character.allianceMembership) {
      const allianceSystem = await prisma.allianceSystem.findUnique({
        where: { systemId: currentSystem }
      });
      if (allianceSystem && allianceSystem.alliance === character.allianceMembership.alliance) {
        isAllyPort = true;
      }
    }

    const liftOffFee = feeWaived ? 0 : calculateLiftOffFee(
      ship.hullStrength,
      currentSystem,
      scoreLevel,
      isAllyPort
    );

    // Build trip summary output (SP.LIFT.S lines 129-141)
    const destName = CORE_SYSTEM_NAMES[destinationSystemId] || `System ${destinationSystemId}`;
    const originName = CORE_SYSTEM_NAMES[currentSystem] || `System ${currentSystem}`;
    const tripNumber = (character.tripCount || 0) + 1;

    let output = '\r\n';
    output += `\x1b[36;1m${'-'.repeat(45)}\x1b[0m\r\n`;
    output += `  Space Trip #           : ${tripNumber}\r\n`;
    output += `  Trip Originates From   : ${originName}\r\n`;
    output += `  Trip Destination To    : ${destName}\r\n`;
    output += `  Estimated Travel Time  : ${validation.travelTime}\r\n`;
    output += `  Estimated Fuel Required: ${validation.fuelRequired} units\r\n`;
    output += `  Fuel On-Board          : ${ship.fuel} units\r\n`;

    if (feeWaived) {
      output += `\r\n${waiveReason}\r\n`;
      output += `\r\nCare to Launch now?  [Y]/(N): `;
    } else {
      // Show fee line (SP.LIFT.S lines 139-140)
      output += `       Port Lift-Off fee `;
      if (isAllyPort) {
        output += `50% Allies Discount = ${liftOffFee}\r\n`;
      } else {
        output += `= ${liftOffFee} cr\r\n`;
      }
      output += `\r\nWill you pay the fee?  [Y]/(N): `;
    }

    // Store pending launch state
    pendingLaunches.set(characterId, {
      destinationSystemId,
      fuelRequired: validation.fuelRequired || 0,
      liftOffFee,
      feeWaived,
      waiveReason,
    });

    return { output };
  }
};

// SP.LIFT.S lines 76–109: bribe state machine
async function handleBribe(
  characterId: string,
  input: string,
  bribe: PendingBribe
): Promise<ScreenResponse> {
  const key = input.trim().toUpperCase();

  if (bribe.step === 'ask') {
    if (key !== 'Y') {
      pendingBribes.delete(characterId);
      return { output: 'No\r\n', nextScreen: 'main-menu' };
    }
    // Generate random threshold 1–10 (original: open rand file, x=(random(r))+1)
    const threshold = Math.ceil(Math.random() * 10);
    pendingBribes.set(characterId, { step: 'offer', threshold, offerAmount: 0 });
    return { output: `Yes\r\n\r\nOffer? (1-10) thousand  \x1b[33m<C-R> quits:\x1b[0m ` };
  }

  if (bribe.step === 'offer') {
    if (!key || key === 'Q') {
      pendingBribes.delete(characterId);
      return { output: '\r\n', nextScreen: 'main-menu' };
    }
    if (key.length > 2) {
      return { output: '\r\n\x1b[31mToo Much!\x1b[0m\r\n\r\nOffer? (1-10) thousand  <C-R> quits: ' };
    }
    const i = parseInt(key, 10);
    if (isNaN(i) || i < 1 || i > 10) {
      return { output: '\r\n\x1b[31mToo Much!\x1b[0m\r\n\r\nOffer? (1-10) thousand  <C-R> quits: ' };
    }
    // SP.LIFT.S line 91: if i<x goto bribo (stay on offer prompt)
    if (i < bribe.threshold) {
      return { output: `\r\n\x1b[33mNot enough...\x1b[0m\r\n\r\nOffer? (1-10) thousand  <C-R> quits: ` };
    }
    // Threshold met — check if player can afford it
    const character = await prisma.character.findUnique({ where: { id: characterId } });
    if (!character) {
      pendingBribes.delete(characterId);
      return { output: '\x1b[31mError.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }
    const totalCredits = (character.creditsHigh * 10000) + character.creditsLow;
    if (totalCredits < i * 1000) {
      pendingBribes.delete(characterId);
      return { output: `\r\n\x1b[31mNot enough funds!\x1b[0m\r\n`, nextScreen: 'main-menu' };
    }
    pendingBribes.set(characterId, { step: 'type', threshold: bribe.threshold, offerAmount: i });
    return { output: `\r\nLet's see the credits!\r\n\r\nWhat kinda papers? (C)argo/(S)muggling: ` };
  }

  if (bribe.step === 'type') {
    if (key !== 'C' && key !== 'S') {
      return { output: `\r\nWhat kinda papers? (C)argo/(S)muggling: ` };
    }
    const isSmuggling = key === 'S';
    const cargoLabel = isSmuggling ? 'Smuggling' : 'Cargo';
    const cargoManifest = isSmuggling ? 'Contraband' : '=-Space-=';
    const cargoType = isSmuggling ? 10 : 0;

    const character = await prisma.character.findUnique({ where: { id: characterId } });
    if (!character) {
      pendingBribes.delete(characterId);
      return { output: '\x1b[31mError.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    // Deduct bribe amount (SP.LIFT.S line 106: g2=g2-i)
    const cost = bribe.offerAmount * 1000;
    let newLow = character.creditsLow - cost;
    let newHigh = character.creditsHigh;
    while (newLow < 0 && newHigh > 0) { newHigh -= 1; newLow += 10000; }

    // Set free contract state (SP.LIFT.S lines 106–107)
    await prisma.character.update({
      where: { id: characterId },
      data: {
        creditsHigh: newHigh,
        creditsLow: newLow,
        cargoPods: 1,
        missionType: 1,
        destination: 0,
        cargoManifest,
        cargoType,
        cargoPayment: 0,
      },
    });

    pendingBribes.delete(characterId);

    const ship = await prisma.ship.findUnique({ where: { characterId } });
    const fuel = ship?.fuel || 0;
    const confirmMsg = `${key}\r\n\r\nHere's the Forged ${cargoLabel} Manifest Papers.\r\nInput your new destination after lift-off\r\n`;
    return { output: confirmMsg + destinationPromptOutput(character.currentSystem, fuel) };
  }

  // Shouldn't reach here
  pendingBribes.delete(characterId);
  return { output: '\r\n', nextScreen: 'main-menu' };
}

async function handleFeeConfirmation(
  characterId: string,
  input: string,
  pending: PendingLaunch
): Promise<ScreenResponse> {
  pendingLaunches.delete(characterId);

  const answer = input.trim().toUpperCase();
  if (answer === 'N') {
    return { output: 'No\r\n', nextScreen: 'main-menu' };
  }

  // Y or Enter = yes (default is Y per original: [Y]/(N))
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { ship: true }
  });

  if (!character || !character.ship) {
    return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
  }

  // Deduct fee if not waived (SP.LIFT.S lines 146-158)
  if (!pending.feeWaived && pending.liftOffFee > 0) {
    const totalCredits = (character.creditsHigh * 10000) + character.creditsLow;
    if (totalCredits < pending.liftOffFee) {
      return {
        output: 'Yes\r\n\x1b[31mNot enough funds!\x1b[0m\r\n',
        nextScreen: 'main-menu'
      };
    }

    // Deduct fee using high/low credit split (SP.LIFT.S lines 146-148, gosub crinc/crfix)
    let newLow = character.creditsLow - pending.liftOffFee;
    let newHigh = character.creditsHigh;
    while (newLow < 0 && newHigh > 0) {
      newHigh -= 1;
      newLow += 10000;
    }

    await prisma.character.update({
      where: { id: characterId },
      data: { creditsHigh: newHigh, creditsLow: newLow }
    });

    // Add fee to port bank if port has an owner (SP.LIFT.S lines 180-181)
    const portOwnership = await prisma.portOwnership.findUnique({
      where: { systemId: character.currentSystem }
    });
    if (portOwnership) {
      let bankLow = portOwnership.bankCreditsLow + pending.liftOffFee;
      let bankHigh = portOwnership.bankCreditsHigh;
      while (bankLow > 9999) {
        bankLow -= 10000;
        bankHigh += 1;
      }
      await prisma.portOwnership.update({
        where: { id: portOwnership.id },
        data: { bankCreditsHigh: bankHigh, bankCreditsLow: bankLow }
      });
    }

    // Log the fee (SP.LIFT.S lines 156-157: sp.fee file)
    await prisma.gameLog.create({
      data: {
        type: 'PORT_FEE',
        characterId,
        message: `Lift-off fee paid: ${pending.liftOffFee} cr at system ${character.currentSystem}`,
        metadata: { fee: pending.liftOffFee, system: character.currentSystem },
      }
    });
  }

  // Launch!
  try {
    await startTravel(characterId, character.currentSystem, pending.destinationSystemId, pending.fuelRequired);
    return {
      output: `Yes\r\n\r\n\x1b[36;1mThank you ${character.name}. Your ship and papers are in order.\x1b[0m\r\n\x1b[32mYou are cleared for Lift-Off!\x1b[0m\r\n\r\n\x1b[36;1mENGAGING DRIVES...\x1b[0m\r\n\x1b[33mFuel consumed: ${pending.fuelRequired}\x1b[0m\r\n\r\n\x1b[32mYou have Lift-Off!..Lookin' Good!...Bon Voyage ${character.name}!\x1b[0m\r\n`,
      nextScreen: 'main-menu'
    };
  } catch (err) {
    return { output: '\r\n\x1b[31mSystem Error during launch sequence.\x1b[0m\r\n> ' };
  }
}

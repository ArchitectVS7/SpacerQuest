/**
 * SpacerQuest v4.0 - Global E2E Test Setup
 */

import { FullConfig } from '@playwright/test';

export default async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use;
  
  console.log(`🚀 SpacerQuest E2E Tests Starting...`);
  console.log(`📡 Base URL: ${baseURL}`);
  console.log(`🎮 Testing SpacerQuest v4.0`);
  
  // Verify backend is running
  try {
    const response = await fetch('http://localhost:3000/health');
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Backend healthy: ${data.status}`);
    }
  } catch (error) {
    console.warn('⚠️  Backend not responding on port 3000');
  }
}

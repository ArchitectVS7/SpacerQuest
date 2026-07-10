/**
 * SpacerQuest v4.0 - Screen Types
 */

export interface ScreenResponse {
  output: string; // ANSI text to render
  nextScreen?: string; // If navigating
  data?: Record<string, unknown>; // Additional structured data if helpful
}

export interface ScreenModule {
  name: string;
  render: (characterId: string) => Promise<ScreenResponse>;
  handleInput: (characterId: string, input: string) => Promise<ScreenResponse>;
}

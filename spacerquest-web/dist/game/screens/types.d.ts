/**
 * SpacerQuest v4.0 - Screen Types
 */
export interface ScreenResponse {
    output: string;
    nextScreen?: string;
    data?: any;
}
export interface ScreenModule {
    name: string;
    render: (characterId: string) => Promise<ScreenResponse>;
    handleInput: (characterId: string, input: string) => Promise<ScreenResponse>;
}
//# sourceMappingURL=types.d.ts.map
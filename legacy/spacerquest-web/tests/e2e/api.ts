/**
 * SpacerQuest v4.0 - API Helper for E2E Tests
 * 
 * Direct API calls for setup and verification
 */

import { APIRequestContext } from '@playwright/test';

export class SpacerQuestAPI {
  private baseURL: string;
  private token: string | null = null;
  private requestContext: any = null;

  constructor(baseURL: string = 'http://localhost:3000') {
    this.baseURL = baseURL;
  }

  async init(request: any) {
    this.requestContext = request;
  }

  setToken(token: string) {
    this.token = token;
  }

  getHeaders() {
    return this.token ? { 'Authorization': `Bearer ${this.token}` } : {};
  }

  async devLogin(): Promise<{ token: string; userId: string }> {
    if (!this.requestContext) {
      throw new Error('API not initialized with request context');
    }
    
    const response = await this.requestContext.get(`${this.baseURL}/auth/dev-login`, {
      maxRedirects: 0,
    });
    
    // Extract token from redirect URL
    const location = response.headers()['location'];
    if (location) {
      const url = new URL(location, this.baseURL);
      const token = url.searchParams.get('token');
      if (token) {
        this.token = token;
        return { token, userId: '' };
      }
    }
    
    throw new Error('Failed to get token from dev login');
  }

  async getCharacter() {
    if (!this.requestContext) return null;
    
    const response = await this.requestContext.get(`${this.baseURL}/api/character`, {
      headers: this.getHeaders(),
    });
    
    if (response.status() === 404) {
      return null;
    }
    
    return response.json();
  }

  async createCharacter(name: string, shipName: string) {
    if (!this.requestContext) return null;
    
    const response = await this.requestContext.post(`${this.baseURL}/auth/character`, {
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      data: { name, shipName },
    });
    
    return response.json();
  }

  async getShipStatus() {
    if (!this.requestContext) return null;
    
    const response = await this.requestContext.get(`${this.baseURL}/api/ship/status`, {
      headers: this.getHeaders(),
    });
    
    return response.json();
  }

  async buyFuel(units: number) {
    if (!this.requestContext) return null;
    
    const response = await this.requestContext.post(`${this.baseURL}/api/economy/fuel/buy`, {
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      data: { units },
    });
    
    return response.json();
  }

  async acceptCargo() {
    if (!this.requestContext) return null;
    
    const response = await this.requestContext.post(`${this.baseURL}/api/economy/cargo/accept`, {
      headers: this.getHeaders(),
    });
    
    return response.json();
  }

  async getTravelStatus() {
    if (!this.requestContext) return null;
    
    const response = await this.requestContext.get(`${this.baseURL}/api/navigation/travel-status`, {
      headers: this.getHeaders(),
    });
    
    return response.json();
  }

  async launch(destinationSystemId: number) {
    if (!this.requestContext) return null;
    
    const response = await this.requestContext.post(`${this.baseURL}/api/navigation/launch`, {
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      data: { destinationSystemId },
    });
    
    return response.json();
  }

  async getTopGun() {
    if (!this.requestContext) return { categories: [] };
    
    const response = await this.requestContext.get(`${this.baseURL}/api/social/topgun`);
    
    if (!response.ok()) {
      return { categories: [] };
    }
    
    return response.json();
  }

  async getLeaderboard() {
    if (!this.requestContext) return { scores: [] };
    
    const response = await this.requestContext.get(`${this.baseURL}/api/social/leaderboard`);
    
    if (!response.ok()) {
      return { scores: [] };
    }
    
    return response.json();
  }
}

import type { APIKey } from '../types';

const API_BASE = '/api';

export const api = {
  async getHealth(): Promise<{ status: string; hasActiveLLM: boolean }> {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error('Failed to get health status');
    return res.json();
  },

  async getAPIKeys(): Promise<APIKey[]> {
    const res = await fetch(`${API_BASE}/settings/api-keys`);
    if (!res.ok) throw new Error('Failed to get API keys');
    const data = await res.json();
    return data.keys;
  },

  async addAPIKey(provider: string, apiKey: string, name?: string): Promise<APIKey> {
    const res = await fetch(`${API_BASE}/settings/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, apiKey, name }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to add API key');
    }
    return res.json();
  },

  async activateAPIKey(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/settings/api-keys/${id}/activate`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to activate API key');
  },

  async deleteAPIKey(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/settings/api-keys/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete API key');
  },

  // ── Calendar ────────────────────────────────────────────────────────────────

  async getGoogleAuthUrl(): Promise<{ url: string }> {
    const res = await fetch(`${API_BASE}/auth/google`);
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to get Google auth URL');
    }
    return res.json();
  },

  async getCalendarStatus(): Promise<{ configured: boolean; authType: string | null; label: string | null; email: string | null; createdAt: number | null }> {
    const res = await fetch(`${API_BASE}/settings/calendar`);
    if (!res.ok) throw new Error('Failed to get calendar status');
    return res.json();
  },

  async saveCalendarCredentials(serviceAccountJson: string, label?: string): Promise<{ success: boolean; clientEmail: string; label: string }> {
    const res = await fetch(`${API_BASE}/settings/calendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceAccountJson, label }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to save calendar credentials');
    }
    return res.json();
  },

  async deleteCalendarCredentials(): Promise<void> {
    const res = await fetch(`${API_BASE}/settings/calendar`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to remove calendar credentials');
  },

  // ── Cal.com ──────────────────────────────────────────────────────────────────

  async getCalcomStatus(): Promise<{ configured: boolean; label: string | null; createdAt: number | null }> {
    const res = await fetch(`${API_BASE}/settings/calcom`);
    if (!res.ok) throw new Error('Failed to get Cal.com status');
    return res.json();
  },

  async saveCalcomCredentials(apiKey: string, label?: string): Promise<{ success: boolean; label: string }> {
    const res = await fetch(`${API_BASE}/settings/calcom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, label }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to save Cal.com credentials');
    }
    return res.json();
  },

  async deleteCalcomCredentials(): Promise<void> {
    const res = await fetch(`${API_BASE}/settings/calcom`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to remove Cal.com credentials');
  },

  // ── Document Upload ──────────────────────────────────────────────────────────

  async uploadDocument(file: File): Promise<{ success: boolean; fileName: string; size: number }> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      let message = 'Failed to upload document';
      try {
        const err = await res.json();
        if (err.error) message = err.error;
      } catch {
        // ignore JSON parse errors
      }
      throw new Error(message);
    }

    return res.json();
  },
};

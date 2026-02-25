import { useState, useEffect } from 'react';
import { Plus, Trash2, Check, Key, Calendar, ChevronDown, ChevronUp, AlertCircle, ExternalLink, Link } from 'lucide-react';
import { api } from '../services/api';
import type { APIKey } from '../types';

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
  { value: 'anthropic', label: 'Anthropic Claude', placeholder: 'sk-ant-...' },
  { value: 'gemini', label: 'Google Gemini', placeholder: 'AI...' },
  { value: 'kimi', label: 'Kimi (Moonshot)', placeholder: 'sk-...' },
  { value: 'together', label: 'Together.ai', placeholder: 'your-together-api-key' },
  { value: 'groq', label: 'Groq (Llama)', placeholder: 'gsk_...' },
];

interface CalendarStatus {
  configured: boolean;
  authType: string | null;
  label: string | null;
  email: string | null;
  createdAt: number | null;
}

export function SettingsPage() {
  // ── LLM API Keys ──────────────────────────────────────────────────────────
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ provider: 'openai', apiKey: '', name: '' });

  // ── Calendar ──────────────────────────────────────────────────────────────
  const [calStatus, setCalStatus] = useState<CalendarStatus>({ configured: false, authType: null, label: null, email: null, createdAt: null });
  const [calLoading, setCalLoading] = useState(true);
  const [showServiceAccountForm, setShowServiceAccountForm] = useState(false);
  const [showCalInstructions, setShowCalInstructions] = useState(false);
  const [calJson, setCalJson] = useState('');
  const [calLabel, setCalLabel] = useState('');
  const [calSaving, setCalSaving] = useState(false);
  const [oauthConnecting, setOauthConnecting] = useState(false);

  // ── Cal.com ────────────────────────────────────────────────────────────────
  const [calcomStatus, setCalcomStatus] = useState<{ configured: boolean; label: string | null; createdAt: number | null }>({ configured: false, label: null, createdAt: null });
  const [calcomLoading, setCalcomLoading] = useState(true);
  const [showCalcomForm, setShowCalcomForm] = useState(false);
  const [showCalcomInstructions, setShowCalcomInstructions] = useState(false);
  const [calcomApiKey, setCalcomApiKey] = useState('');
  const [calcomLabel, setCalcomLabel] = useState('');
  const [calcomSaving, setCalcomSaving] = useState(false);

  // ── Shared ─────────────────────────────────────────────────────────────────
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadKeys();
    loadCalendarStatus();
    loadCalcomStatus();

    // Handle OAuth redirect result (?calendar=connected or ?calendar=error)
    const params = new URLSearchParams(window.location.search);
    const calParam = params.get('calendar');
    if (calParam === 'connected') {
      setSuccess('Google Calendar connected successfully!');
      window.history.replaceState({}, '', '/settings');
    } else if (calParam === 'error') {
      const msg = params.get('msg');
      setError(`Failed to connect Google Calendar${msg ? `: ${msg}` : '. Please try again.'}`);
      window.history.replaceState({}, '', '/settings');
    }
  }, []);

  // ── LLM handlers ─────────────────────────────────────────────────────────

  const loadKeys = async () => {
    try {
      setKeysLoading(true);
      const data = await api.getAPIKeys();
      setKeys(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setKeysLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      await api.addAPIKey(formData.provider, formData.apiKey, formData.name || undefined);
      setSuccess('API key added successfully!');
      setFormData({ provider: 'openai', apiKey: '', name: '' });
      setShowForm(false);
      await loadKeys();
    } catch (err: any) { setError(err.message); }
  };

  const handleActivate = async (id: number) => {
    try {
      await api.activateAPIKey(id);
      setSuccess('API key activated!');
      await loadKeys();
    } catch (err: any) { setError(err.message); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this API key?')) return;
    try {
      await api.deleteAPIKey(id);
      setSuccess('API key deleted!');
      await loadKeys();
    } catch (err: any) { setError(err.message); }
  };

  // ── Calendar handlers ──────────────────────────────────────────────────────

  const loadCalendarStatus = async () => {
    try {
      setCalLoading(true);
      const status = await api.getCalendarStatus();
      setCalStatus(status);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCalLoading(false);
    }
  };

  const handleOAuthConnect = async () => {
    setError(''); setSuccess('');
    setOauthConnecting(true);
    try {
      const { url } = await api.getGoogleAuthUrl();
      window.location.href = url;
    } catch (err: any) {
      setError(err.message);
      setOauthConnecting(false);
    }
  };

  const handleCalSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setCalSaving(true);
    try {
      const result = await api.saveCalendarCredentials(calJson.trim(), calLabel || undefined);
      setSuccess(`Google Calendar connected! Service account: ${result.clientEmail}`);
      setCalJson('');
      setCalLabel('');
      setShowServiceAccountForm(false);
      await loadCalendarStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCalSaving(false);
    }
  };

  const handleCalDelete = async () => {
    if (!confirm('Disconnect Google Calendar? The assistant will lose calendar access.')) return;
    setError(''); setSuccess('');
    try {
      await api.deleteCalendarCredentials();
      setSuccess('Google Calendar disconnected.');
      await loadCalendarStatus();
    } catch (err: any) { setError(err.message); }
  };

  // ── Cal.com handlers ───────────────────────────────────────────────────────

  const loadCalcomStatus = async () => {
    try {
      setCalcomLoading(true);
      const status = await api.getCalcomStatus();
      setCalcomStatus(status);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCalcomLoading(false);
    }
  };

  const handleCalcomSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setCalcomSaving(true);
    try {
      await api.saveCalcomCredentials(calcomApiKey.trim(), calcomLabel || undefined);
      setSuccess('Cal.com connected successfully!');
      setCalcomApiKey('');
      setCalcomLabel('');
      setShowCalcomForm(false);
      await loadCalcomStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCalcomSaving(false);
    }
  };

  const handleCalcomDelete = async () => {
    if (!confirm('Disconnect Cal.com? The assistant will lose Cal.com access.')) return;
    setError(''); setSuccess('');
    try {
      await api.deleteCalcomCredentials();
      setSuccess('Cal.com disconnected.');
      await loadCalcomStatus();
    } catch (err: any) { setError(err.message); }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">

        {/* Page title */}
        <div>
          <h1 className="text-3xl font-bold text-primary-500 mb-2">Settings</h1>
          <p className="text-dark-400">Configure your AI providers and integrations</p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="p-4 bg-primary-900/20 border border-primary-700 rounded-lg text-primary-400 flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="p-4 bg-green-900/20 border border-green-700 rounded-lg text-green-400">
            {success}
          </div>
        )}

        {/* ── Section 1: LLM API Keys ────────────────────────────────────── */}
        <section>
          <div className="flex items-center space-x-3 mb-4">
            <Key className="w-6 h-6 text-primary-500" />
            <h2 className="text-xl font-semibold">AI Provider API Keys</h2>
          </div>
          <p className="text-dark-400 text-sm mb-4">
            Add your API key for OpenAI, Anthropic Claude, Google Gemini, or others. The active key is used for all chat responses.
          </p>

          {!showForm && (
            <button onClick={() => setShowForm(true)} className="btn-primary mb-6 flex items-center space-x-2">
              <Plus className="w-5 h-5" />
              <span>Add API Key</span>
            </button>
          )}

          {showForm && (
            <div className="card mb-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                <Key className="w-5 h-5 text-primary-500" />
                <span>Add New API Key</span>
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Provider</label>
                  <select
                    value={formData.provider}
                    onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                    className="input"
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">API Key</label>
                  <input
                    type="password"
                    value={formData.apiKey}
                    onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                    placeholder={PROVIDERS.find((p) => p.value === formData.provider)?.placeholder}
                    className="input font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Name (Optional)</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., My OpenAI Key"
                    className="input"
                  />
                </div>
                <div className="flex space-x-3">
                  <button type="submit" className="btn-primary">Add Key</button>
                  <button
                    type="button"
                    onClick={() => { setShowForm(false); setFormData({ provider: 'openai', apiKey: '', name: '' }); }}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="space-y-3">
            {keysLoading ? (
              <div className="card text-center text-dark-400">Loading...</div>
            ) : keys.length === 0 ? (
              <div className="card text-center text-dark-400">No API keys configured. Add one to get started!</div>
            ) : (
              keys.map((key) => (
                <div
                  key={key.id}
                  className={`card flex items-center justify-between ${key.isActive ? 'border-primary-600' : ''}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className={`px-3 py-1 rounded text-sm font-medium ${key.isActive ? 'bg-primary-600 text-white' : 'bg-dark-700 text-dark-300'}`}>
                        {PROVIDERS.find((p) => p.value === key.provider)?.label || key.provider}
                      </div>
                      {key.name && <span className="text-dark-300">{key.name}</span>}
                      {key.isActive && (
                        <span className="flex items-center space-x-1 text-green-400 text-sm">
                          <Check className="w-4 h-4" /><span>Active</span>
                        </span>
                      )}
                    </div>
                    {key.lastUsed && (
                      <div className="text-xs text-dark-500 mt-1">
                        Last used: {new Date(key.lastUsed * 1000).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    {!key.isActive && (
                      <button onClick={() => handleActivate(key.id)} className="btn-secondary text-sm">Set Active</button>
                    )}
                    <button onClick={() => handleDelete(key.id)} className="text-primary-500 hover:text-primary-400 transition-colors">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ── Section 2: Google Calendar ─────────────────────────────────── */}
        <section>
          <div className="flex items-center space-x-3 mb-4">
            <Calendar className="w-6 h-6 text-primary-500" />
            <h2 className="text-xl font-semibold">Google Calendar</h2>
          </div>
          <p className="text-dark-400 text-sm mb-4">
            Connect your Google Calendar so the AI assistant can view, book, update and cancel events on your behalf.
          </p>

          {/* Status card */}
          {calLoading ? (
            <div className="card text-center text-dark-400">Loading...</div>
          ) : calStatus.configured ? (
            <div className="card border-green-700 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Check className="w-5 h-5 text-green-400" />
                  <div>
                    <div className="font-medium text-green-400">
                      Connected {calStatus.authType === 'oauth' ? 'via Google Account' : 'via Service Account'}
                    </div>
                    {calStatus.email && <div className="text-sm text-dark-300">{calStatus.email}</div>}
                    {calStatus.label && !calStatus.email && <div className="text-sm text-dark-400">{calStatus.label}</div>}
                    {calStatus.createdAt && (
                      <div className="text-xs text-dark-500">
                        Connected {new Date(calStatus.createdAt * 1000).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={handleCalDelete} className="text-primary-500 hover:text-primary-400 transition-colors" title="Disconnect">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="card border-dark-600 mb-4">
              <div className="flex items-center space-x-3 text-dark-400">
                <Calendar className="w-5 h-5" />
                <span>No calendar connected</span>
              </div>
            </div>
          )}

          {/* Connect options */}
          {!calStatus.configured && (
            <div className="space-y-3">
              {/* Primary: OAuth */}
              <button
                onClick={handleOAuthConnect}
                disabled={oauthConnecting}
                className="w-full flex items-center justify-center space-x-3 px-6 py-3 bg-white text-gray-800 rounded-lg font-medium hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                <span>{oauthConnecting ? 'Redirecting to Google...' : 'Connect with Google'}</span>
                {!oauthConnecting && <ExternalLink className="w-4 h-4 opacity-60" />}
              </button>

              {/* Secondary: Service Account (collapsible) */}
              <div className="border border-dark-700 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowServiceAccountForm(!showServiceAccountForm)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-dark-400 hover:text-white transition-colors"
                >
                  <span>Use a service account instead (advanced)</span>
                  {showServiceAccountForm ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showServiceAccountForm && (
                  <div className="px-4 pb-4 border-t border-dark-700">
                    {/* Instructions */}
                    <div className="mt-4 mb-4 bg-dark-800 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setShowCalInstructions(!showCalInstructions)}
                        className="w-full flex items-center justify-between px-4 py-3 text-sm text-dark-300 hover:text-white transition-colors"
                      >
                        <span className="font-medium">How to get service account credentials</span>
                        {showCalInstructions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      {showCalInstructions && (
                        <ol className="px-4 pb-4 space-y-2 text-sm text-dark-300 list-decimal list-inside">
                          <li>Go to <span className="text-primary-400">console.cloud.google.com</span> and create or select a project.</li>
                          <li>Enable the <span className="text-white font-medium">Google Calendar API</span>.</li>
                          <li>Go to <span className="text-white font-medium">IAM &amp; Admin → Service Accounts</span> and create a service account.</li>
                          <li>Click the account → <span className="text-white font-medium">Keys → Add Key → JSON</span>. Download the file.</li>
                          <li>Open Google Calendar → <span className="text-white font-medium">Settings → Share with specific people</span>. Add the service account email with <span className="text-white font-medium">"Make changes to events"</span>.</li>
                          <li>Paste the downloaded JSON file contents below.</li>
                        </ol>
                      )}
                    </div>

                    <form onSubmit={handleCalSave} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-dark-300 mb-2">Service Account JSON</label>
                        <textarea
                          value={calJson}
                          onChange={(e) => setCalJson(e.target.value)}
                          placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  ...\n}'}
                          className="input font-mono text-xs h-40 resize-none"
                          required
                          spellCheck={false}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-dark-300 mb-2">Label (Optional)</label>
                        <input
                          type="text"
                          value={calLabel}
                          onChange={(e) => setCalLabel(e.target.value)}
                          placeholder="e.g., Work Calendar"
                          className="input"
                        />
                      </div>
                      <button type="submit" disabled={calSaving} className="btn-primary disabled:opacity-50">
                        {calSaving ? 'Connecting...' : 'Connect with Service Account'}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* What the agent can do */}
          {calStatus.configured && (
            <div className="mt-4 p-4 bg-dark-800 rounded-lg">
              <p className="text-sm font-medium text-dark-300 mb-2">The assistant can now:</p>
              <ul className="text-sm text-dark-400 space-y-1 list-disc list-inside">
                <li>View your upcoming events and appointments</li>
                <li>Check availability / free-busy slots</li>
                <li>Book new appointments</li>
                <li>Update or reschedule existing events</li>
                <li>Cancel appointments</li>
              </ul>
              <p className="text-xs text-dark-500 mt-3">
                Try asking: "What's on my calendar this week?" or "Book a meeting tomorrow at 2pm"
              </p>
            </div>
          )}
        </section>

        {/* ── Section 3: Cal.com ──────────────────────────────────────────── */}
        <section>
          <div className="flex items-center space-x-3 mb-4">
            <Link className="w-6 h-6 text-primary-500" />
            <h2 className="text-xl font-semibold">Cal.com</h2>
          </div>
          <p className="text-dark-400 text-sm mb-4">
            Connect your Cal.com account so the AI assistant can manage bookings, check availability, and schedule appointments through your Cal.com booking pages.
          </p>

          {/* Status card */}
          {calcomLoading ? (
            <div className="card text-center text-dark-400">Loading...</div>
          ) : calcomStatus.configured ? (
            <div className="card border-green-700 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Check className="w-5 h-5 text-green-400" />
                  <div>
                    <div className="font-medium text-green-400">Connected</div>
                    {calcomStatus.label && <div className="text-sm text-dark-300">{calcomStatus.label}</div>}
                    {calcomStatus.createdAt && (
                      <div className="text-xs text-dark-500">
                        Connected {new Date(calcomStatus.createdAt * 1000).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={handleCalcomDelete} className="text-primary-500 hover:text-primary-400 transition-colors" title="Disconnect">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="card border-dark-600 mb-4">
              <div className="flex items-center space-x-3 text-dark-400">
                <Link className="w-5 h-5" />
                <span>Cal.com not connected</span>
              </div>
            </div>
          )}

          {/* Connect form */}
          {!calcomStatus.configured && !showCalcomForm && (
            <button onClick={() => setShowCalcomForm(true)} className="btn-primary flex items-center space-x-2">
              <Plus className="w-5 h-5" />
              <span>Connect Cal.com</span>
            </button>
          )}

          {showCalcomForm && (
            <div className="card">
              <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                <Link className="w-5 h-5 text-primary-500" />
                <span>Add Cal.com API Key</span>
              </h3>

              {/* Instructions */}
              <div className="mb-4 bg-dark-800 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowCalcomInstructions(!showCalcomInstructions)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-dark-300 hover:text-white transition-colors"
                >
                  <span className="font-medium">How to get your Cal.com API key</span>
                  {showCalcomInstructions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showCalcomInstructions && (
                  <ol className="px-4 pb-4 space-y-2 text-sm text-dark-300 list-decimal list-inside">
                    <li>Go to <span className="text-primary-400">cal.com</span> and sign in to your account.</li>
                    <li>Navigate to <span className="text-white font-medium">Settings → Developer → API Keys</span>.</li>
                    <li>Click <span className="text-white font-medium">Add</span> to generate a new API key.</li>
                    <li>Copy the key and paste it below.</li>
                  </ol>
                )}
              </div>

              <form onSubmit={handleCalcomSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">API Key</label>
                  <input
                    type="password"
                    value={calcomApiKey}
                    onChange={(e) => setCalcomApiKey(e.target.value)}
                    placeholder="cal_live_..."
                    className="input font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Label (Optional)</label>
                  <input
                    type="text"
                    value={calcomLabel}
                    onChange={(e) => setCalcomLabel(e.target.value)}
                    placeholder="e.g., My Cal.com"
                    className="input"
                  />
                </div>
                <div className="flex space-x-3">
                  <button type="submit" disabled={calcomSaving} className="btn-primary disabled:opacity-50">
                    {calcomSaving ? 'Connecting...' : 'Connect Cal.com'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowCalcomForm(false); setCalcomApiKey(''); setCalcomLabel(''); }}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* What the agent can do */}
          {calcomStatus.configured && (
            <div className="mt-4 p-4 bg-dark-800 rounded-lg">
              <p className="text-sm font-medium text-dark-300 mb-2">The assistant can now:</p>
              <ul className="text-sm text-dark-400 space-y-1 list-disc list-inside">
                <li>List your Cal.com event types (booking pages)</li>
                <li>Check available slots for any event type</li>
                <li>Create new bookings for attendees</li>
                <li>Cancel existing bookings</li>
                <li>Reschedule bookings to a new time</li>
              </ul>
              <p className="text-xs text-dark-500 mt-3">
                Try asking: "What event types do I have on Cal.com?" or "Check availability for my 30-min call this week"
              </p>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Plus, Trash2, Check, Key, Calendar, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import type { APIKey } from '../types';

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
  { value: 'anthropic', label: 'Anthropic Claude', placeholder: 'sk-ant-...' },
  { value: 'gemini', label: 'Google Gemini', placeholder: 'AI...' },
  { value: 'kimi', label: 'Kimi (Moonshot)', placeholder: 'sk-...' },
  { value: 'together', label: 'Together.ai', placeholder: 'your-together-api-key' },
];

interface CalendarStatus {
  configured: boolean;
  label: string | null;
  createdAt: number | null;
}

export function SettingsPage() {
  // ── LLM API Keys ──────────────────────────────────────────────────────────
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ provider: 'openai', apiKey: '', name: '' });

  // ── Calendar ──────────────────────────────────────────────────────────────
  const [calStatus, setCalStatus] = useState<CalendarStatus>({ configured: false, label: null, createdAt: null });
  const [calLoading, setCalLoading] = useState(true);
  const [showCalForm, setShowCalForm] = useState(false);
  const [showCalInstructions, setShowCalInstructions] = useState(false);
  const [calJson, setCalJson] = useState('');
  const [calLabel, setCalLabel] = useState('');
  const [calSaving, setCalSaving] = useState(false);

  // ── Shared ─────────────────────────────────────────────────────────────────
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadKeys();
    loadCalendarStatus();
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

  const handleCalSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setCalSaving(true);
    try {
      const result = await api.saveCalendarCredentials(calJson.trim(), calLabel || undefined);
      setSuccess(`Google Calendar connected! Service account: ${result.clientEmail}`);
      setCalJson('');
      setCalLabel('');
      setShowCalForm(false);
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
            Add your API key for OpenAI, Anthropic Claude, Google Gemini, or Kimi. The active key is used for all chat responses.
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
            Connect a Google service account so the AI assistant can view, book, update and cancel calendar events on your behalf.
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
                    <div className="font-medium text-green-400">Connected</div>
                    {calStatus.label && <div className="text-sm text-dark-400">{calStatus.label}</div>}
                    {calStatus.createdAt && (
                      <div className="text-xs text-dark-500">
                        Added {new Date(calStatus.createdAt * 1000).toLocaleDateString()}
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

          {/* Connect form toggle */}
          {!calStatus.configured && !showCalForm && (
            <button onClick={() => setShowCalForm(true)} className="btn-primary flex items-center space-x-2">
              <Plus className="w-5 h-5" />
              <span>Connect Google Calendar</span>
            </button>
          )}

          {showCalForm && (
            <div className="card">
              <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-primary-500" />
                <span>Paste Service Account Credentials</span>
              </h3>

              {/* Collapsible instructions */}
              <div className="mb-4 bg-dark-800 rounded-lg overflow-hidden">
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
                    <li>Enable the <span className="text-white font-medium">Google Calendar API</span> for the project.</li>
                    <li>Go to <span className="text-white font-medium">IAM &amp; Admin → Service Accounts</span> and create a new service account.</li>
                    <li>Click the service account → <span className="text-white font-medium">Keys → Add Key → Create new key (JSON)</span>. Download the file.</li>
                    <li>Open your Google Calendar → <span className="text-white font-medium">Settings → Share with specific people</span>. Add the service account email (ends in <code className="text-primary-400">@...iam.gserviceaccount.com</code>) with <span className="text-white font-medium">"Make changes to events"</span> permission.</li>
                    <li>Paste the entire contents of the downloaded JSON file below.</li>
                  </ol>
                )}
              </div>

              <form onSubmit={handleCalSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    Service Account JSON
                  </label>
                  <textarea
                    value={calJson}
                    onChange={(e) => setCalJson(e.target.value)}
                    placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  "private_key": "...",\n  ...\n}'}
                    className="input font-mono text-xs h-48 resize-none"
                    required
                    spellCheck={false}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    Label (Optional)
                  </label>
                  <input
                    type="text"
                    value={calLabel}
                    onChange={(e) => setCalLabel(e.target.value)}
                    placeholder="e.g., Work Calendar"
                    className="input"
                  />
                </div>
                <div className="flex space-x-3">
                  <button type="submit" disabled={calSaving} className="btn-primary disabled:opacity-50">
                    {calSaving ? 'Connecting...' : 'Connect Calendar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowCalForm(false); setCalJson(''); setCalLabel(''); }}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </form>
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

      </div>
    </div>
  );
}

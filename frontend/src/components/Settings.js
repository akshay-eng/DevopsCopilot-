import React, { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useTheme } from '../context/ThemeContext';
import { Users, Search, Plus, Trash2, ChevronDown, Filter, X, Loader2, Mail, Copy, CheckCircle2 } from 'lucide-react';
import { backendApi } from '../services/api';

const TABS = ['Users', 'Workspace', 'AI Assistant', 'Advanced', 'SSO and RBAC Permissions', 'API keys', 'Quick links'];
const ROLES = ['Admin', 'Editor', 'Viewer'];

const Settings = () => {
  const { theme } = useTheme();
  const dk = theme === 'dark';
  const { user } = useSelector((s) => s.auth);
  const [tab, setTab] = useState('Users');
  const [q, setQ] = useState('');

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [invite, setInvite] = useState(null); // { name, email, role, sending, result }

  const fetchUsers = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await backendApi.get('/api/users');
      if (res?.success) setUsers(res.users || []);
      else setErr(res?.error || 'Failed to load users');
    } catch (e) { setErr(e.message || 'Failed to load users'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const filtered = users.filter((u) => u.email.toLowerCase().includes(q.toLowerCase()) || (u.name || '').toLowerCase().includes(q.toLowerCase()));

  const changeRole = async (id, role) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
    try { await backendApi.patch(`/api/users/${id}/role`, { role }); } catch { fetchUsers(); }
  };

  const removeUser = async (id) => {
    if (!window.confirm('Remove this user? They will lose access immediately.')) return;
    try { await backendApi.delete(`/api/users/${id}`); setUsers((prev) => prev.filter((u) => u.id !== id)); }
    catch (e) { alert(e.message || 'Failed to remove user'); }
  };

  const submitInvite = async () => {
    setInvite((v) => ({ ...v, sending: true, error: null }));
    try {
      const res = await backendApi.post('/api/users/invite', { name: invite.name, email: invite.email, role: invite.role });
      if (res?.success) {
        setInvite((v) => ({ ...v, sending: false, result: res }));
        fetchUsers();
      } else {
        setInvite((v) => ({ ...v, sending: false, error: res?.error || 'Failed to invite' }));
      }
    } catch (e) {
      setInvite((v) => ({ ...v, sending: false, error: e.message || 'Failed to invite' }));
    }
  };

  const openInvite = () => setInvite({ name: '', email: '', role: 'Viewer', sending: false, result: null, error: null });

  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${dk ? 'bg-[#0a0a0a] text-slate-200' : 'bg-white text-gray-900'}`}>
      {/* Header + tabs */}
      <div className={`px-6 pt-5 ${dk ? 'bg-[#0a0a0a]' : 'bg-white'}`}>
        <h1 className={`text-[22px] font-bold ${dk ? 'text-white' : 'text-gray-900'}`}>Settings</h1>
        <div className={`flex items-center gap-6 mt-4 border-b ${dk ? 'border-slate-800' : 'border-gray-200'} overflow-x-auto`}>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-3 text-[14px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                tab === t
                  ? dk ? 'border-white text-white' : 'border-gray-900 text-gray-900'
                  : dk ? 'border-transparent text-slate-400 hover:text-slate-200' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto px-6 py-5 ${dk ? 'bg-[#0a0a0a]' : 'bg-gray-50'}`}>
        {tab === 'Users' ? (
          <>
            <div className={`flex items-center gap-2 mb-4 text-[15px] ${dk ? 'text-slate-300' : 'text-gray-600'}`}>
              <Users size={17} strokeWidth={1.9} /> <span>User Access</span>
            </div>

            <div className={`rounded-xl border ${dk ? 'bg-[#141414] border-slate-800' : 'bg-white border-gray-200'}`}>
              <div className={`flex items-center justify-between px-4 py-3 border-b ${dk ? 'border-slate-800' : 'border-gray-100'}`}>
                <span className={`text-[13px] ${dk ? 'text-slate-400' : 'text-gray-500'}`}>
                  {loading ? 'Loading…' : `Showing 1 - ${filtered.length} out of ${users.length} Users`}
                </span>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={14} className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${dk ? 'text-slate-500' : 'text-gray-400'}`} />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Type / to search"
                      className={`w-56 pl-8 pr-3 py-1.5 text-[13px] rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 ${dk ? 'bg-slate-800/60 border-slate-700 text-slate-200 placeholder-slate-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`}
                    />
                  </div>
                  <button onClick={openInvite} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                    <Plus size={14} strokeWidth={2.4} /> New User
                  </button>
                </div>
              </div>

              {err && <div className="px-4 py-3 text-[13px] text-red-500">{err}</div>}

              <table className="w-full">
                <thead>
                  <tr className={`text-[11px] ${dk ? 'text-slate-500' : 'text-gray-500'}`}>
                    <th className="text-left font-medium px-4 py-2.5">Email</th>
                    <th className="text-left font-medium px-4 py-2.5"><span className="inline-flex items-center gap-1">Role <Filter size={11} className="opacity-50" /></span></th>
                    <th className="text-left font-medium px-4 py-2.5"><span className="inline-flex items-center gap-1">Status <Filter size={11} className="opacity-50" /></span></th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className={`divide-y ${dk ? 'divide-slate-800' : 'divide-gray-100'}`}>
                  {filtered.map((u) => (
                    <tr key={u.id} className={dk ? 'hover:bg-slate-800/40' : 'hover:bg-gray-50'}>
                      <td className={`px-4 py-3 text-[14px] ${dk ? 'text-slate-200' : 'text-gray-900'}`}>
                        {u.email}
                        {u.email === user?.email && <span className={`ml-2 text-[11px] ${dk ? 'text-slate-500' : 'text-gray-400'}`}>(you)</span>}
                      </td>
                      <td className={`px-4 py-3 text-[14px]`}>
                        <div className="relative inline-block">
                          <select
                            value={u.role}
                            onChange={(e) => changeRole(u.id, e.target.value)}
                            disabled={u.email === user?.email}
                            className={`appearance-none pr-7 pl-2.5 py-1 text-[13px] rounded-md border cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${dk ? 'bg-slate-800/60 border-slate-700 text-slate-200' : 'bg-white border-gray-200 text-gray-700'}`}
                          >
                            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <ChevronDown size={12} className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${dk ? 'text-slate-500' : 'text-gray-400'}`} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-[13px] ${dk ? 'text-slate-300' : 'text-gray-700'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${u.status === 'Active' ? 'bg-green-500' : 'bg-amber-500'}`} /> {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          {u.email !== user?.email && (
                            <button onClick={() => removeUser(u.id)} className={`p-1.5 rounded-md ${dk ? 'text-slate-500 hover:text-red-400 hover:bg-slate-800' : 'text-gray-400 hover:text-red-500 hover:bg-gray-100'}`}><Trash2 size={14} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loading && filtered.length === 0 && (
                    <tr><td colSpan={4} className={`px-4 py-8 text-center text-[13px] ${dk ? 'text-slate-500' : 'text-gray-400'}`}>No users found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className={`rounded-xl border p-10 text-center ${dk ? 'bg-[#141414] border-slate-800 text-slate-500' : 'bg-white border-gray-200 text-gray-400'}`}>
            <p className="text-[15px] font-medium mb-1">{tab}</p>
            <p className="text-[13px]">Configuration for {tab} will appear here.</p>
          </div>
        )}
      </div>

      {/* Invite modal */}
      {invite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !invite.sending && setInvite(null)}>
          <div onClick={(e) => e.stopPropagation()} className={`w-full max-w-md rounded-2xl border shadow-2xl ${dk ? 'bg-[#141414] border-slate-800' : 'bg-white border-gray-200'}`}>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${dk ? 'border-slate-800' : 'border-gray-100'}`}>
              <div className="flex items-center gap-2">
                <Mail size={18} className="text-blue-500" />
                <h3 className={`text-[15px] font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>Invite a user</h3>
              </div>
              <button onClick={() => !invite.sending && setInvite(null)} className={dk ? 'text-slate-500' : 'text-gray-400'}><X size={18} /></button>
            </div>

            {!invite.result ? (
              <>
                <div className="px-5 py-4 space-y-4">
                  <div>
                    <label className={`block text-[12px] mb-1 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>Full name</label>
                    <input value={invite.name} onChange={(e) => setInvite((v) => ({ ...v, name: e.target.value }))} placeholder="Jane Doe"
                      className={`w-full px-3 py-2 text-[14px] rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${dk ? 'bg-slate-800/60 border-slate-700 text-slate-200 placeholder-slate-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`} />
                  </div>
                  <div>
                    <label className={`block text-[12px] mb-1 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>Email address *</label>
                    <input value={invite.email} onChange={(e) => setInvite((v) => ({ ...v, email: e.target.value }))} placeholder="jane@company.com" type="email"
                      className={`w-full px-3 py-2 text-[14px] rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${dk ? 'bg-slate-800/60 border-slate-700 text-slate-200 placeholder-slate-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`} />
                  </div>
                  <div>
                    <label className={`block text-[12px] mb-1 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>Role</label>
                    <div className="grid grid-cols-3 gap-2">
                      {ROLES.map((r) => (
                        <button key={r} onClick={() => setInvite((v) => ({ ...v, role: r }))}
                          className={`px-2 py-2 rounded-lg text-[13px] font-medium border transition-colors ${invite.role === r ? 'border-blue-500 bg-blue-500/10 text-blue-500' : dk ? 'border-slate-700 text-slate-400 hover:bg-slate-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                          {r}
                        </button>
                      ))}
                    </div>
                    <p className={`text-[11px] mt-1.5 ${dk ? 'text-slate-500' : 'text-gray-400'}`}>
                      {invite.role === 'Admin' ? 'Full access, can manage users & integrations.' : invite.role === 'Editor' ? 'Can act on resources & remediate, no user management.' : 'Read-only access to dashboards.'}
                    </p>
                  </div>
                  {invite.error && <div className="text-[13px] text-red-500">{invite.error}</div>}
                </div>
                <div className={`flex items-center justify-end gap-2 px-5 py-3.5 border-t ${dk ? 'border-slate-800' : 'border-gray-100'}`}>
                  <button onClick={() => setInvite(null)} disabled={invite.sending} className={`px-3 py-1.5 rounded-lg text-[13px] font-medium ${dk ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-600 hover:bg-gray-100'}`}>Cancel</button>
                  <button onClick={submitInvite} disabled={invite.sending || !invite.email} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60">
                    {invite.sending ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : <><Mail size={14} /> Send invite</>}
                  </button>
                </div>
              </>
            ) : (
              <div className="px-5 py-5">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 size={20} className="text-green-500" />
                  <span className={`text-[15px] font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>Invite created</span>
                </div>
                <p className={`text-[13px] mb-3 ${dk ? 'text-slate-400' : 'text-gray-600'}`}>
                  {invite.result.emailSent
                    ? <><strong>{invite.result.user.email}</strong> was invited as <strong>{invite.result.user.role}</strong>. An email with sign-in credentials was sent.</>
                    : <>User created, but the email could not be sent{invite.result.emailError ? ` (${invite.result.emailError})` : ''}. Share these credentials manually:</>}
                </p>
                {!invite.result.emailSent && invite.result.tempPassword && (
                  <div className={`rounded-lg border p-3 text-[13px] space-y-1.5 ${dk ? 'border-slate-800 bg-[#1a1a1a]' : 'border-gray-200 bg-gray-50'}`}>
                    <div><span className={dk ? 'text-slate-500' : 'text-gray-500'}>Email:</span> <code>{invite.result.user.email}</code></div>
                    <div className="flex items-center gap-2">
                      <span className={dk ? 'text-slate-500' : 'text-gray-500'}>Temp password:</span> <code>{invite.result.tempPassword}</code>
                      <button onClick={() => navigator.clipboard?.writeText(invite.result.tempPassword)} className={dk ? 'text-slate-400 hover:text-white' : 'text-gray-400 hover:text-gray-700'}><Copy size={13} /></button>
                    </div>
                  </div>
                )}
                <div className="flex justify-end mt-4">
                  <button onClick={() => setInvite(null)} className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white">Done</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;

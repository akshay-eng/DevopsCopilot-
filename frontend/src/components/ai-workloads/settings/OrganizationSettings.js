import React, { useState } from 'react';
import {
    Building2,
    Users,
    CreditCard,
    Crown,
    UserPlus,
    Trash2,
    Edit2,
    ChevronDown,
    DollarSign,
    Zap,
    Database,
    TrendingUp,
    Check,
    X,
    Loader
} from 'lucide-react';

const OrganizationSettings = ({ theme }) => {
    const [selectedOrg, setSelectedOrg] = useState('personal');
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [showPricingModal, setShowPricingModal] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');

    // Mock data
    const organizations = [
        { id: 'personal', name: 'Personal Projects', tier: 'Free' },
        { id: 'acme', name: 'Acme Corp', tier: 'Pro' }
    ];

    const currentOrg = organizations.find(org => org.id === selectedOrg);

    const members = [
        { id: 1, email: 'john.doe@example.com', role: 'Owner' },
        { id: 2, email: 'jane.smith@example.com', role: 'Admin' },
        { id: 3, email: 'bob.wilson@example.com', role: 'Developer' }
    ];

    const pendingInvites = [
        { id: 1, email: 'alice@example.com', role: 'Developer', expiresAt: '2024-02-15' }
    ];

    return (
        <div className="space-y-6">
            {/* Organization Selector */}
            <div className={`rounded-xl border p-6 ${
                theme === 'dark' ? 'border-gray-800 bg-[#13131f]' : 'border-gray-200 bg-white'
            }`}>
                <label className={`block text-sm font-medium mb-2 ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                }`}>
                    Select Organization
                </label>
                <div className="relative">
                    <select
                        value={selectedOrg}
                        onChange={(e) => setSelectedOrg(e.target.value)}
                        className={`w-full px-4 py-2 rounded-lg border outline-none appearance-none ${
                            theme === 'dark'
                                ? 'bg-gray-800 border-gray-700 text-white'
                                : 'bg-white border-gray-300 text-gray-900'
                        }`}
                    >
                        {organizations.map((org) => (
                            <option key={org.id} value={org.id}>
                                {org.name} ({org.tier})
                            </option>
                        ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none" />
                </div>
            </div>

            {/* Tabs */}
            <div className={`border-b ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
                <div className="flex gap-6">
                    {['overview', 'billing', 'team'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`pb-3 px-1 border-b-2 transition-all capitalize ${
                                activeTab === tab
                                    ? 'border-purple-600 text-purple-600'
                                    : theme === 'dark'
                                        ? 'border-transparent text-gray-400 hover:text-gray-300'
                                        : 'border-transparent text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* Organization Details */}
                    <div className={`rounded-xl border p-6 ${
                        theme === 'dark' ? 'border-gray-800 bg-[#13131f]' : 'border-gray-200 bg-white'
                    }`}>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className={`p-3 rounded-lg ${
                                    theme === 'dark' ? 'bg-blue-500/10' : 'bg-blue-50'
                                }`}>
                                    <Building2 className="w-5 h-5 text-blue-500" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold">{currentOrg.name}</h3>
                                    <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                        {members.length} members
                                    </p>
                                </div>
                            </div>
                            <button className={`p-2 rounded-lg transition-colors ${
                                theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
                            }`}>
                                <Edit2 className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                Current Plan:
                            </span>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                currentOrg.tier === 'Pro'
                                    ? 'bg-gradient-to-r from-purple-600 to-violet-600 text-white'
                                    : theme === 'dark'
                                        ? 'bg-gray-800 text-gray-300'
                                        : 'bg-gray-200 text-gray-700'
                            }`}>
                                {currentOrg.tier === 'Pro' && <Crown className="w-3 h-3 inline mr-1" />}
                                {currentOrg.tier}
                            </span>
                            {currentOrg.tier === 'Free' && (
                                <button
                                    onClick={() => setShowPricingModal(true)}
                                    className="ml-2 text-sm text-purple-600 hover:text-purple-700 font-medium"
                                >
                                    Upgrade to Pro →
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-3 gap-4">
                        <StatCard
                            icon={Users}
                            label="Team Members"
                            value={members.length}
                            theme={theme}
                            color="blue"
                        />
                        <StatCard
                            icon={Zap}
                            label="API Requests"
                            value="125K"
                            theme={theme}
                            color="green"
                        />
                        <StatCard
                            icon={TrendingUp}
                            label="Monthly Cost"
                            value="$45.67"
                            theme={theme}
                            color="purple"
                        />
                    </div>
                </div>
            )}

            {/* Billing Tab */}
            {activeTab === 'billing' && (
                <BillingSection theme={theme} currentOrg={currentOrg} onUpgrade={() => setShowPricingModal(true)} />
            )}

            {/* Team Tab */}
            {activeTab === 'team' && (
                <TeamSection
                    theme={theme}
                    members={members}
                    pendingInvites={pendingInvites}
                    onInvite={() => setShowInviteModal(true)}
                />
            )}

            {/* Invite Modal */}
            {showInviteModal && (
                <InviteMemberModal
                    theme={theme}
                    onClose={() => setShowInviteModal(false)}
                />
            )}

            {/* Pricing Modal */}
            {showPricingModal && (
                <PricingModal
                    theme={theme}
                    onClose={() => setShowPricingModal(false)}
                />
            )}
        </div>
    );
};

// Stat Card Component
const StatCard = ({ icon: Icon, label, value, theme, color }) => {
    const colorClasses = {
        blue: 'text-blue-500 bg-blue-500/10',
        green: 'text-green-500 bg-green-500/10',
        purple: 'text-purple-500 bg-purple-500/10'
    };

    return (
        <div className={`rounded-xl border p-4 ${
            theme === 'dark' ? 'border-gray-800 bg-[#13131f]' : 'border-gray-200 bg-white'
        }`}>
            <div className={`p-2 rounded-lg w-fit mb-3 ${colorClasses[color]}`}>
                <Icon className={`w-4 h-4 ${colorClasses[color].split(' ')[0]}`} />
            </div>
            <div className={`text-sm mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                {label}
            </div>
            <div className="text-xl font-bold">{value}</div>
        </div>
    );
};

// Billing Section Component
const BillingSection = ({ theme, currentOrg, onUpgrade }) => {
    const [sliderValues, setSliderValues] = useState({
        seats: 3,
        tokens: 5,
        spans: 10
    });

    const calculateCost = () => {
        const seatCost = sliderValues.seats * 20;
        const tokenCost = sliderValues.tokens * 2;
        const spanCost = sliderValues.spans * 1.5;
        return (seatCost + tokenCost + spanCost).toFixed(2);
    };

    return (
        <div className="space-y-6">
            {/* Subscription Status */}
            <div className={`rounded-xl border p-6 ${
                theme === 'dark' ? 'border-gray-800 bg-[#13131f]' : 'border-gray-200 bg-white'
            }`}>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-lg ${
                            theme === 'dark' ? 'bg-green-500/10' : 'bg-green-50'
                        }`}>
                            <CreditCard className="w-5 h-5 text-green-500" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold">Subscription Status</h3>
                            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                {currentOrg.tier} Plan
                            </p>
                        </div>
                    </div>
                    {currentOrg.tier === 'Free' ? (
                        <button
                            onClick={onUpgrade}
                            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-violet-700 flex items-center gap-2"
                        >
                            <Crown className="w-4 h-4" />
                            Upgrade to Pro
                        </button>
                    ) : (
                        <button className={`px-4 py-2 rounded-lg font-medium ${
                            theme === 'dark' ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-200 hover:bg-gray-300'
                        }`}>
                            Manage Subscription
                        </button>
                    )}
                </div>
            </div>

            {/* Cost Calculator */}
            <div className={`rounded-xl border p-6 ${
                theme === 'dark' ? 'border-gray-800 bg-[#13131f]' : 'border-gray-200 bg-white'
            }`}>
                <h3 className="text-lg font-bold mb-4">Cost Calculator</h3>

                <div className="space-y-6">
                    {/* Seats Slider */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className={`text-sm font-medium ${
                                theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                            }`}>
                                Team Seats
                            </label>
                            <span className="text-sm font-semibold">{sliderValues.seats} × $20 = ${sliderValues.seats * 20}</span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="20"
                            value={sliderValues.seats}
                            onChange={(e) => setSliderValues({ ...sliderValues, seats: parseInt(e.target.value) })}
                            className="w-full h-2 bg-blue-500 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>

                    {/* Tokens Slider */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className={`text-sm font-medium ${
                                theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                            }`}>
                                Tokens (millions)
                            </label>
                            <span className="text-sm font-semibold">{sliderValues.tokens}M × $2 = ${sliderValues.tokens * 2}</span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="50"
                            value={sliderValues.tokens}
                            onChange={(e) => setSliderValues({ ...sliderValues, tokens: parseInt(e.target.value) })}
                            className="w-full h-2 bg-green-500 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>

                    {/* Spans Slider */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className={`text-sm font-medium ${
                                theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                            }`}>
                                Spans (thousands)
                            </label>
                            <span className="text-sm font-semibold">{sliderValues.spans}K × $1.50 = ${(sliderValues.spans * 1.5).toFixed(2)}</span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="100"
                            value={sliderValues.spans}
                            onChange={(e) => setSliderValues({ ...sliderValues, spans: parseInt(e.target.value) })}
                            className="w-full h-2 bg-amber-500 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>

                    {/* Total Cost */}
                    <div className={`pt-4 border-t ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
                        <div className="flex items-center justify-between">
                            <span className="text-lg font-bold">Estimated Monthly Cost</span>
                            <span className="text-2xl font-bold text-purple-600">${calculateCost()}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Team Section Component
const TeamSection = ({ theme, members, pendingInvites, onInvite }) => {
    return (
        <div className="space-y-6">
            {/* Current Members */}
            <div className={`rounded-xl border p-6 ${
                theme === 'dark' ? 'border-gray-800 bg-[#13131f]' : 'border-gray-200 bg-white'
            }`}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold">Team Members</h3>
                    <button
                        onClick={onInvite}
                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-violet-700 flex items-center gap-2"
                    >
                        <UserPlus className="w-4 h-4" />
                        Invite Member
                    </button>
                </div>

                <div className="space-y-3">
                    {members.map((member) => (
                        <div
                            key={member.id}
                            className={`flex items-center justify-between p-3 rounded-lg ${
                                theme === 'dark' ? 'bg-gray-800/50' : 'bg-gray-50'
                            }`}
                        >
                            <div>
                                <div className="font-medium">{member.email}</div>
                                <div className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                    {member.role}
                                </div>
                            </div>
                            {member.role !== 'Owner' && (
                                <button className={`p-2 rounded-lg transition-colors ${
                                    theme === 'dark' ? 'hover:bg-gray-700 text-red-400' : 'hover:bg-gray-200 text-red-600'
                                }`}>
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Pending Invites */}
            {pendingInvites.length > 0 && (
                <div className={`rounded-xl border p-6 ${
                    theme === 'dark' ? 'border-gray-800 bg-[#13131f]' : 'border-gray-200 bg-white'
                }`}>
                    <h3 className="text-lg font-bold mb-4">Pending Invitations</h3>
                    <div className="space-y-3">
                        {pendingInvites.map((invite) => (
                            <div
                                key={invite.id}
                                className={`flex items-center justify-between p-3 rounded-lg ${
                                    theme === 'dark' ? 'bg-gray-800/50' : 'bg-gray-50'
                                }`}
                            >
                                <div>
                                    <div className="font-medium">{invite.email}</div>
                                    <div className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                        {invite.role} • Expires {invite.expiresAt}
                                    </div>
                                </div>
                                <button className={`px-3 py-1 rounded-lg text-sm font-medium ${
                                    theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
                                }`}>
                                    Revoke
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// Invite Member Modal
const InviteMemberModal = ({ theme, onClose }) => {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('Developer');
    const [isLoading, setIsLoading] = useState(false);

    const handleInvite = () => {
        setIsLoading(true);
        setTimeout(() => {
            setIsLoading(false);
            onClose();
        }, 1000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className={`w-full max-w-md rounded-xl shadow-xl p-6 ${
                theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'
            }`}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold">Invite Team Member</h3>
                    <button onClick={onClose} className={`p-1 rounded-lg ${
                        theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
                    }`}>
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className={`block text-sm font-medium mb-2 ${
                            theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                            Email Address
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className={`w-full px-4 py-2 rounded-lg border outline-none ${
                                theme === 'dark'
                                    ? 'bg-gray-800 border-gray-700 text-white'
                                    : 'bg-white border-gray-300 text-gray-900'
                            }`}
                            placeholder="colleague@example.com"
                        />
                    </div>

                    <div>
                        <label className={`block text-sm font-medium mb-2 ${
                            theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                            Role
                        </label>
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            className={`w-full px-4 py-2 rounded-lg border outline-none ${
                                theme === 'dark'
                                    ? 'bg-gray-800 border-gray-700 text-white'
                                    : 'bg-white border-gray-300 text-gray-900'
                            }`}
                        >
                            <option>Developer</option>
                            <option>Admin</option>
                        </select>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button
                            onClick={onClose}
                            className={`flex-1 px-4 py-2 rounded-lg font-medium ${
                                theme === 'dark'
                                    ? 'bg-gray-800 hover:bg-gray-700'
                                    : 'bg-gray-200 hover:bg-gray-300'
                            }`}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleInvite}
                            disabled={isLoading || !email}
                            className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-violet-700 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isLoading ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Send Invite
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Pricing Modal
const PricingModal = ({ theme, onClose }) => {
    const plans = [
        {
            name: 'Free',
            price: '$0',
            features: ['1 project', '100K tokens/month', 'Community support']
        },
        {
            name: 'Pro',
            price: '$20',
            features: ['Unlimited projects', 'Unlimited tokens', 'Priority support', 'Advanced analytics'],
            highlighted: true
        },
        {
            name: 'Enterprise',
            price: 'Custom',
            features: ['Custom deployment', 'SLA guarantee', 'Dedicated support', 'Custom integrations']
        }
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className={`w-full max-w-4xl rounded-xl shadow-xl p-6 ${
                theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'
            }`}>
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-bold">Choose Your Plan</h3>
                    <button onClick={onClose} className={`p-1 rounded-lg ${
                        theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
                    }`}>
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    {plans.map((plan) => (
                        <div
                            key={plan.name}
                            className={`rounded-xl border p-6 ${
                                plan.highlighted
                                    ? 'border-purple-600 bg-gradient-to-b from-purple-600/10 to-transparent'
                                    : theme === 'dark'
                                        ? 'border-gray-800'
                                        : 'border-gray-200'
                            }`}
                        >
                            {plan.highlighted && (
                                <div className="flex items-center gap-1 text-purple-600 text-sm font-semibold mb-2">
                                    <Crown className="w-4 h-4" />
                                    Most Popular
                                </div>
                            )}
                            <h4 className="text-xl font-bold mb-2">{plan.name}</h4>
                            <div className="text-3xl font-bold mb-4">
                                {plan.price}
                                {plan.price !== 'Custom' && <span className="text-sm font-normal text-gray-500">/month</span>}
                            </div>
                            <ul className="space-y-2 mb-6">
                                {plan.features.map((feature, idx) => (
                                    <li key={idx} className="flex items-center gap-2 text-sm">
                                        <Check className="w-4 h-4 text-green-500" />
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                            <button
                                className={`w-full px-4 py-2 rounded-lg font-medium ${
                                    plan.highlighted
                                        ? 'bg-gradient-to-r from-purple-600 to-violet-600 text-white hover:from-purple-700 hover:to-violet-700'
                                        : theme === 'dark'
                                            ? 'bg-gray-800 hover:bg-gray-700'
                                            : 'bg-gray-200 hover:bg-gray-300'
                                }`}
                            >
                                {plan.name === 'Enterprise' ? 'Contact Sales' : 'Choose Plan'}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default OrganizationSettings;

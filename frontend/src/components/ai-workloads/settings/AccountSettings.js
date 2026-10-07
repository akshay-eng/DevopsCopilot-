import React, { useState } from 'react';
import { User, Check, Loader } from 'lucide-react';

const AccountSettings = ({ theme }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [name, setName] = useState('John Doe');
    const [email] = useState('john.doe@example.com');

    const handleUpdateAccount = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        // Simulate API call
        setTimeout(() => {
            setIsLoading(false);
            // Show success toast (would integrate with real toast library)
            console.log('Account updated successfully');
        }, 1000);
    };

    return (
        <div className="space-y-6">
            {/* Account Details Card */}
            <div className={`rounded-xl border p-6 ${
                theme === 'dark' ? 'border-gray-800 bg-[#13131f]' : 'border-gray-200 bg-white'
            }`}>
                <div className="flex items-center gap-3 mb-6">
                    <div className={`p-3 rounded-lg ${
                        theme === 'dark' ? 'bg-purple-500/10' : 'bg-purple-50'
                    }`}>
                        <User className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold">Account Details</h3>
                        <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                            Update your account information
                        </p>
                    </div>
                </div>

                <form onSubmit={handleUpdateAccount} className="space-y-4">
                    <div>
                        <label className={`block text-sm font-medium mb-2 ${
                            theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                            Full Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className={`w-full px-4 py-2 rounded-lg border outline-none transition-colors ${
                                theme === 'dark'
                                    ? 'bg-gray-800 border-gray-700 text-white focus:border-purple-600'
                                    : 'bg-white border-gray-300 text-gray-900 focus:border-purple-600'
                            }`}
                            placeholder="Enter your full name"
                            disabled={isLoading}
                        />
                    </div>

                    <div>
                        <label className={`block text-sm font-medium mb-2 ${
                            theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                            Email Address
                        </label>
                        <input
                            type="email"
                            value={email}
                            disabled
                            className={`w-full px-4 py-2 rounded-lg border ${
                                theme === 'dark'
                                    ? 'bg-gray-900 border-gray-800 text-gray-500'
                                    : 'bg-gray-100 border-gray-200 text-gray-500'
                            }`}
                        />
                        <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'}`}>
                            Email cannot be changed
                        </p>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="px-6 py-2 bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <Loader className="w-4 h-4 animate-spin" />
                                Updating...
                            </>
                        ) : (
                            <>
                                <Check className="w-4 h-4" />
                                Update Account
                            </>
                        )}
                    </button>
                </form>
            </div>

            {/* Security Settings Card */}
            <div className={`rounded-xl border p-6 ${
                theme === 'dark' ? 'border-gray-800 bg-[#13131f]' : 'border-gray-200 bg-white'
            }`}>
                <h3 className="text-lg font-bold mb-2">Security</h3>
                <p className={`text-sm mb-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    Manage your password and security settings
                </p>

                <button
                    className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                        theme === 'dark'
                            ? 'bg-gray-800 hover:bg-gray-700 text-white'
                            : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                    }`}
                >
                    Change Password
                </button>
            </div>
        </div>
    );
};

export default AccountSettings;

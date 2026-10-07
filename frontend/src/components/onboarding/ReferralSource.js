import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { completeOnboarding } from '../../redux/slices/onboardingSlice';
import { updateUser } from '../../redux/slices/authSlice';

const ReferralSource = ({ data, updateData, nextStep, prevStep }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [selectedSource, setSelectedSource] = useState(data.referralSource || '');
  const [customSource, setCustomSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const referralSources = [
    { id: 'google-search', name: 'Search Engine', description: 'Google, Bing, etc.' },
    { id: 'social-media', name: 'Social Media', description: 'Twitter, LinkedIn, etc.' },
    { id: 'friend-referral', name: 'Colleague/Friend', description: 'Word of mouth' },
    { id: 'conference', name: 'Conference/Event', description: 'Trade show, meetup' },
    { id: 'blog-article', name: 'Blog/Article', description: 'Technical blog post' },
    { id: 'youtube', name: 'YouTube/Video', description: 'Video tutorial or review' },
    { id: 'github', name: 'GitHub/GitLab', description: 'Repository or discussion' },
    { id: 'advertisement', name: 'Advertisement', description: 'Online ad or sponsor' },
    { id: 'other', name: 'Other', description: 'Please specify' }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const finalSource = selectedSource === 'other' && customSource ? customSource : selectedSource;
    if (!finalSource) {
      setError('Please select how you heard about us');
      return;
    }

    setLoading(true);

    try {
      // Complete onboarding with all collected data
      const result = await dispatch(completeOnboarding({
        foundUsThrough: finalSource,
        clusterName: data.clusterName,
        clusterType: data.clusterType,
        hasPrometheus: data.hasPrometheus,
        hasGrafana: data.hasGrafana
      }));

      if (result.type === 'onboarding/complete/fulfilled') {
        // Update user in auth slice to reflect onboarding completion
        dispatch(updateUser({
          onboardingCompleted: true
        }));

        // Redirect to dashboard
        navigate('/dashboard');
      } else {
        throw new Error(result.payload || 'Failed to complete onboarding');
      }
    } catch (err) {
      console.error('Complete onboarding error:', err);
      setError(err.message || 'Failed to complete onboarding. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#13131f] rounded-xl border border-slate-800 overflow-hidden max-h-[calc(100vh-300px)] flex flex-col">
      <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-8 py-6 flex-shrink-0">
        <h2 className="text-2xl font-bold text-white mb-2">How Did You Hear About Us?</h2>
        <p className="text-violet-100">Help us understand how you discovered AIOps Platform</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
        <div className="p-8 overflow-y-auto flex-1">
          {error && (
            <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-300">{error}</p>
              </div>
            </div>
          )}

          <div className="mb-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {referralSources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => setSelectedSource(source.id)}
                  disabled={loading}
                  className={`p-5 rounded-lg border-2 transition-all text-left ${
                    selectedSource === source.id
                      ? 'border-violet-500 bg-violet-500/10'
                      : 'border-slate-700 hover:border-violet-500/50 bg-[#1a1a2e]'
                  } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <h3 className="font-semibold text-white mb-1">{source.name}</h3>
                  <p className="text-sm text-slate-400">{source.description}</p>
                </button>
              ))}
            </div>
          </div>

          {selectedSource === 'other' && (
            <div className="mb-8">
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Please specify where you heard about us
              </label>
              <input
                type="text"
                value={customSource}
                onChange={(e) => setCustomSource(e.target.value)}
                placeholder="e.g., Product Hunt, Reddit, etc."
                className="w-full px-4 py-3 bg-[#1a1a2e] border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                disabled={loading}
                autoFocus
              />
            </div>
          )}

          <div className="bg-violet-500/10 border border-violet-500/30 rounded-lg p-4">
            <div className="flex space-x-3">
              <svg className="w-5 h-5 text-violet-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-slate-300">
                <p className="font-medium mb-1">Why do we ask?</p>
                <p className="text-slate-400">Understanding how users discover our platform helps us create better content and reach more teams who need reliable AIOps solutions.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-8 py-6 border-t border-slate-800 bg-[#13131f] flex-shrink-0">
          <button
            type="button"
            onClick={prevStep}
            disabled={loading}
            className="text-slate-400 hover:text-white font-medium transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back</span>
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-8 py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-lg hover:from-violet-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg font-semibold flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Completing Setup...</span>
              </>
            ) : (
              <>
                <span>Complete Setup</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ReferralSource;

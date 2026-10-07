import React from 'react';
import { useNavigate } from 'react-router-dom';

const VerifyEmailSent = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center px-6 py-12">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500 rounded-full blur-3xl opacity-10"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500 rounded-full blur-3xl opacity-10"></div>
      </div>

      {/* Success Card */}
      <div className="relative w-full max-w-md">
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700 p-8 shadow-2xl text-center">
          {/* Success Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76" />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-white mb-4">Check Your Email!</h1>

          {/* Message */}
          <p className="text-gray-400 mb-2">
            We've sent you a verification email. Please check your inbox and click the verification link to activate your account.
          </p>
          <p className="text-sm text-gray-500 mb-8">
            Don't forget to check your spam folder if you don't see it.
          </p>

          {/* Instructions */}
          <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6 mb-6">
            <div className="flex items-start space-x-3 mb-4">
              <div className="flex-shrink-0 w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center text-white text-sm font-bold">1</div>
              <p className="text-left text-gray-300 text-sm">Open your email inbox</p>
            </div>
            <div className="flex items-start space-x-3 mb-4">
              <div className="flex-shrink-0 w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center text-white text-sm font-bold">2</div>
              <p className="text-left text-gray-300 text-sm">Find the email from DevOps Copilot</p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center text-white text-sm font-bold">3</div>
              <p className="text-left text-gray-300 text-sm">Click the verification link to continue</p>
            </div>
          </div>

          {/* Resend Email Link */}
          <div className="text-sm text-gray-400 mb-6">
            Didn't receive the email?{' '}
            <button className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium">
              Resend verification email
            </button>
          </div>

          {/* Back to Login */}
          <button
            onClick={() => navigate('/login')}
            className="text-gray-400 hover:text-white transition-colors flex items-center justify-center space-x-2 mx-auto"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Login</span>
          </button>
        </div>

        {/* Additional Help */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Having trouble?{' '}
            <a href="mailto:support@devopscopilot.com" className="text-indigo-400 hover:text-indigo-300 transition-colors">
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmailSent;

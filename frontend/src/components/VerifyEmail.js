import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { verifyEmail as verifyEmailAction } from '../redux/slices/authSlice';

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [status, setStatus] = useState('verifying'); // verifying, success, error
  const [message, setMessage] = useState('');
  const verifiedRef = React.useRef(false); // Prevent double verification

  useEffect(() => {
    const verify = async () => {
      const token = searchParams.get('token');

      if (!token) {
        setStatus('error');
        setMessage('Invalid verification link');
        return;
      }

      // Prevent double verification in React Strict Mode
      if (verifiedRef.current) {
        console.log('Verification already attempted, skipping...');
        return;
      }
      verifiedRef.current = true;

      try {
        console.log('=== EMAIL VERIFICATION DEBUG ===');
        console.log('Verifying token:', token);
        console.log('Token length:', token?.length);

        const result = await dispatch(verifyEmailAction(token));

        console.log('Full verification result:', JSON.stringify(result, null, 2));
        console.log('Result type:', result.type);
        console.log('Result payload:', result.payload);
        console.log('Result meta:', result.meta);

        if (result.type === 'auth/verifyEmail/fulfilled') {
          console.log('✅ Verification successful - payload:', result.payload);
          setStatus('success');
          setMessage(result.payload?.message || 'Email verified successfully!');

          // Redirect to onboarding after 3 seconds
          setTimeout(() => {
            navigate('/onboarding');
          }, 3000);
        } else if (result.type === 'auth/verifyEmail/rejected') {
          console.log('❌ Verification rejected');
          console.log('Error payload:', result.payload);
          console.log('Error:', result.error);
          setStatus('error');
          setMessage(result.payload || 'Email verification failed. The link may have expired.');
        } else {
          console.log('⚠️ Unexpected result type:', result.type);
          setStatus('error');
          setMessage('Email verification failed. The link may have expired.');
        }
      } catch (error) {
        console.error('Verification exception caught:', error);
        console.error('Error details:', error.message, error.stack);
        setStatus('error');
        setMessage('An unexpected error occurred during verification.');
      }
    };

    verify();
  }, [searchParams, navigate, dispatch]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-purple-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
        {status === 'verifying' && (
          <>
            <div className="mb-6">
              <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mx-auto"></div>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Verifying Your Email</h2>
            <p className="text-gray-600">Please wait while we verify your email address...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mb-6">
              <div className="bg-green-100 rounded-full p-4 inline-block">
                <svg className="w-16 h-16 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Email Verified!</h2>
            <p className="text-gray-600 mb-4">{message}</p>
            <p className="text-sm text-gray-500">Redirecting to onboarding...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="mb-6">
              <div className="bg-red-100 rounded-full p-4 inline-block">
                <svg className="w-16 h-16 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Verification Failed</h2>
            <p className="text-gray-600 mb-6">{message}</p>
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 transition-all duration-200"
            >
              Back to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;

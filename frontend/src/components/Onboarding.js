import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ClusterSetup from './onboarding/ClusterSetup';
import InstallationInstructions from './onboarding/InstallationInstructions';
import ConnectivityTest from './onboarding/ConnectivityTest';
import ReferralSource from './onboarding/ReferralSource';
import OnboardingComplete from './onboarding/OnboardingComplete';

const Onboarding = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [onboardingData, setOnboardingData] = useState({
    clusterType: '',
    hasPrometheus: false,
    hasGrafana: false,
    installationComplete: false,
    connectionEstablished: false,
    referralSource: ''
  });

  const totalSteps = 4;

  const steps = [
    {
      number: 1,
      title: 'Cluster Setup',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
        </svg>
      )
    },
    {
      number: 2,
      title: 'Installation',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      )
    },
    {
      number: 3,
      title: 'Connect',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )
    },
    {
      number: 4,
      title: 'Finish',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    }
  ];

  const updateData = (data) => {
    setOnboardingData(prev => ({ ...prev, ...data }));
  };

  const nextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else {
      setCurrentStep(5);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <ClusterSetup data={onboardingData} updateData={updateData} nextStep={nextStep} />;
      case 2:
        return <InstallationInstructions data={onboardingData} updateData={updateData} nextStep={nextStep} prevStep={prevStep} />;
      case 3:
        return <ConnectivityTest data={onboardingData} updateData={updateData} nextStep={nextStep} prevStep={prevStep} />;
      case 4:
        return <ReferralSource data={onboardingData} updateData={updateData} nextStep={nextStep} prevStep={prevStep} />;
      case 5:
        return <OnboardingComplete data={onboardingData} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Header */}
      <nav className="bg-[#13131f] border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-xl font-bold text-white">AIOps Platform</span>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="text-slate-400 hover:text-white text-sm font-medium transition-colors"
          >
            Sign Out
          </button>
        </div>
      </nav>

      {/* Progress Steps */}
      {currentStep <= totalSteps && (
        <div className="bg-[#13131f] border-b border-slate-800">
          <div className="max-w-4xl mx-auto px-6 py-8">
            <div className="flex items-center justify-between">
              {steps.map((step, index) => (
                <React.Fragment key={step.number}>
                  <div className="flex flex-col items-center flex-1">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold transition-all ${
                      currentStep > step.number
                        ? 'bg-violet-600 text-white'
                        : currentStep === step.number
                        ? 'bg-violet-500 text-white ring-4 ring-violet-500/20'
                        : 'bg-slate-800 text-slate-600'
                    }`}>
                      {currentStep > step.number ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        step.icon
                      )}
                    </div>
                    <span className={`mt-2 text-sm font-medium ${
                      currentStep >= step.number ? 'text-slate-300' : 'text-slate-600'
                    }`}>
                      {step.title}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`flex-1 h-1 mx-4 rounded transition-all ${
                      currentStep > step.number ? 'bg-violet-600' : 'bg-slate-800'
                    }`}></div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        {renderStep()}
      </div>
    </div>
  );
};

export default Onboarding;

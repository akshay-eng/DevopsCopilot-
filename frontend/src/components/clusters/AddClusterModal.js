import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { X, Server, Package, CheckCircle, Loader } from 'lucide-react';
import { registerCluster, checkConnectionStatus } from '../../redux/slices/clusterSlice';
import { useTheme } from '../../context/ThemeContext';

const AddClusterModal = ({ isOpen, onClose, onClusterAdded }) => {
  const dispatch = useDispatch();
  const { theme } = useTheme();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form data
  const [formData, setFormData] = useState({
    name: '',
    clusterType: '',
    hasPrometheus: false,
    hasGrafana: false,
    hasLoki: false,
  });

  // Registration response
  const [registrationData, setRegistrationData] = useState(null);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);

  const steps = [
    { number: 1, title: 'Cluster Details', icon: Server },
    { number: 2, title: 'Installation', icon: Package },
    { number: 3, title: 'Verify Connection', icon: CheckCircle },
  ];

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setError(null);
  };

  const handleNextStep = async () => {
    if (currentStep === 1) {
      if (!formData.name || !formData.clusterType) {
        setError('Please fill in all required fields');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await dispatch(registerCluster(formData)).unwrap();
        setRegistrationData(result);
        setCurrentStep(2);
      } catch (err) {
        setError(err || 'Failed to register cluster');
      } finally {
        setLoading(false);
      }
    } else if (currentStep === 2) {
      setCurrentStep(3);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setError(null);
    }
  };

  const checkConnection = async () => {
    setCheckingConnection(true);
    setError(null);

    try {
      const result = await dispatch(
        checkConnectionStatus(registrationData.cluster._id)
      ).unwrap();

      setConnectionStatus(result);

      if (result.status === 'connected') {
        setTimeout(() => {
          onClusterAdded();
          handleClose();
        }, 2000);
      }
    } catch (err) {
      setError(err || 'Failed to check connection');
    } finally {
      setCheckingConnection(false);
    }
  };

  const handleClose = () => {
    setCurrentStep(1);
    setFormData({
      name: '',
      clusterType: '',
      hasPrometheus: false,
      hasGrafana: false,
      hasLoki: false,
    });
    setRegistrationData(null);
    setConnectionStatus(null);
    setError(null);
    onClose();
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className={`${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'} rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${theme === 'dark' ? 'border-slate-700' : 'border-gray-200'}`}>
          <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Add New Cluster</h2>
          <button
            onClick={handleClose}
            className={`transition-colors ${theme === 'dark' ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <X size={24} />
          </button>
        </div>

        {/* Progress Steps */}
        <div className={`px-6 py-4 border-b ${theme === 'dark' ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-gray-200'}`}>
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <React.Fragment key={step.number}>
                <div className="flex items-center flex-1">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${
                      currentStep >= step.number
                        ? 'bg-violet-600 border-violet-600 text-white'
                        : theme === 'dark'
                          ? 'bg-slate-800 border-slate-600 text-slate-500'
                          : 'bg-white border-gray-300 text-gray-400'
                    }`}
                  >
                    {currentStep > step.number ? (
                      <CheckCircle size={20} />
                    ) : (
                      <step.icon size={20} />
                    )}
                  </div>
                  <div className="ml-3">
                    <p
                      className={`text-sm font-medium ${
                        currentStep >= step.number
                          ? theme === 'dark' ? 'text-violet-400' : 'text-violet-600'
                          : theme === 'dark' ? 'text-slate-500' : 'text-gray-400'
                      }`}
                    >
                      Step {step.number}
                    </p>
                    <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>{step.title}</p>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`flex-1 h-1 mx-4 transition-colors ${
                      currentStep > step.number
                        ? 'bg-violet-600'
                        : theme === 'dark' ? 'bg-slate-700' : 'bg-gray-200'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 280px)' }}>
          {error && (
            <div className={`mb-4 p-3 border rounded-md text-sm ${theme === 'dark' ? 'bg-red-900/50 border-red-800 text-red-200' : 'bg-red-50 border-red-200 text-red-700'}`}>
              {error}
            </div>
          )}

          {/* Step 1: Cluster Details */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
                  Cluster Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g., Production Cluster"
                  className={`w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-violet-500 focus:border-transparent ${theme === 'dark' ? 'border-slate-600 bg-slate-900 text-white' : 'border-gray-300 bg-white text-gray-900'}`}
                  required
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
                  Cluster Type <span className="text-red-500">*</span>
                </label>
                <select
                  name="clusterType"
                  value={formData.clusterType}
                  onChange={handleChange}
                  className={`w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-violet-500 focus:border-transparent ${theme === 'dark' ? 'border-slate-600 bg-slate-900 text-white' : 'border-gray-300 bg-white text-gray-900'}`}
                  required
                >
                  <option value="">Select cluster type</option>
                  <option value="openshift-ocp">OpenShift OCP</option>
                  <option value="gke">GCP GKE</option>
                  <option value="eks">AWS EKS</option>
                  <option value="aks">Azure AKS</option>
                  <option value="minikube">Minikube</option>
                  <option value="k3s">K3s</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-3 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
                  Existing Monitoring Setup
                </label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="hasPrometheus"
                      checked={formData.hasPrometheus}
                      onChange={handleChange}
                      className={`w-4 h-4 text-violet-600 rounded focus:ring-violet-500 ${theme === 'dark' ? 'border-slate-600' : 'border-gray-300'}`}
                    />
                    <span className={`ml-2 text-sm ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>Prometheus is installed</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="hasGrafana"
                      checked={formData.hasGrafana}
                      onChange={handleChange}
                      className={`w-4 h-4 text-violet-600 rounded focus:ring-violet-500 ${theme === 'dark' ? 'border-slate-600' : 'border-gray-300'}`}
                    />
                    <span className={`ml-2 text-sm ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>Grafana is installed</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="hasLoki"
                      checked={formData.hasLoki}
                      onChange={handleChange}
                      className={`w-4 h-4 text-violet-600 rounded focus:ring-violet-500 ${theme === 'dark' ? 'border-slate-600' : 'border-gray-300'}`}
                    />
                    <span className={`ml-2 text-sm ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>Loki is installed</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Installation */}
          {currentStep === 2 && registrationData && (
            <div className="space-y-6">
              <div className={`border rounded-md p-4 ${theme === 'dark' ? 'bg-violet-900/30 border-violet-800' : 'bg-violet-50 border-violet-200'}`}>
                <h3 className={`text-lg font-semibold mb-2 ${theme === 'dark' ? 'text-violet-100' : 'text-violet-900'}`}>
                  Install DevOps Copilot Agent
                </h3>
                <p className={`text-sm ${theme === 'dark' ? 'text-violet-300' : 'text-violet-700'}`}>
                  Run the following command in your Kubernetes cluster to install the monitoring
                  agent.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={`block text-sm font-medium ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>Helm Command</label>
                  <button
                    onClick={() => copyToClipboard(registrationData.helmCommand)}
                    className={`text-xs font-medium ${theme === 'dark' ? 'text-violet-400 hover:text-violet-300' : 'text-violet-600 hover:text-violet-700'}`}
                  >
                    Copy
                  </button>
                </div>
                <pre className={`p-4 rounded-md overflow-x-auto text-sm ${theme === 'dark' ? 'bg-black text-gray-100' : 'bg-slate-900 text-gray-100'}`}>
                  {registrationData.helmCommand}
                </pre>
              </div>

              <div>
                <h4 className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
                  Installation Instructions
                </h4>
                <ol className={`list-decimal list-inside space-y-3 text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                  {registrationData.instructions?.steps?.map((step, index) => (
                    <li key={index}>
                      <strong className={theme === 'dark' ? 'text-slate-200' : 'text-gray-700'}>{step.title}:</strong> {step.description}
                    </li>
                  ))}
                </ol>
              </div>

              <div className={`border rounded-md p-4 ${theme === 'dark' ? 'bg-yellow-900/30 border-yellow-800' : 'bg-yellow-50 border-yellow-200'}`}>
                <p className={`text-sm ${theme === 'dark' ? 'text-yellow-200' : 'text-yellow-800'}`}>
                  <strong>Note:</strong> Keep this window open. After installing the Helm chart,
                  proceed to the next step to verify the connection.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Verify Connection */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="text-center py-8">
                {!connectionStatus && (
                  <>
                    <div className="mb-4">
                      <Server className={`w-16 h-16 mx-auto ${theme === 'dark' ? 'text-slate-600' : 'text-gray-400'}`} />
                    </div>
                    <h3 className={`text-lg font-semibold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      Verify Cluster Connection
                    </h3>
                    <p className={`text-sm mb-6 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                      Click the button below to check if your cluster is connected.
                    </p>
                    <button
                      onClick={checkConnection}
                      disabled={checkingConnection}
                      className={`px-6 py-2 rounded-md flex items-center mx-auto ${checkingConnection ? theme === 'dark' ? 'bg-slate-600 cursor-not-allowed' : 'bg-gray-400 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-700'} text-white`}
                    >
                      {checkingConnection ? (
                        <>
                          <Loader className="animate-spin mr-2" size={16} />
                          Checking Connection...
                        </>
                      ) : (
                        'Check Connection'
                      )}
                    </button>
                  </>
                )}

                {connectionStatus && connectionStatus.status === 'connected' && (
                  <div className={`border rounded-md p-6 ${theme === 'dark' ? 'bg-green-900/30 border-green-800' : 'bg-green-50 border-green-200'}`}>
                    <CheckCircle className={`w-16 h-16 mx-auto mb-4 ${theme === 'dark' ? 'text-green-400' : 'text-green-600'}`} />
                    <h3 className={`text-lg font-semibold mb-2 ${theme === 'dark' ? 'text-green-100' : 'text-green-900'}`}>
                      Connection Successful!
                    </h3>
                    <p className={`text-sm ${theme === 'dark' ? 'text-green-300' : 'text-green-700'}`}>
                      Your cluster is now connected and ready to use.
                    </p>
                  </div>
                )}

                {connectionStatus && connectionStatus.status !== 'connected' && (
                  <div className={`border rounded-md p-6 ${theme === 'dark' ? 'bg-yellow-900/30 border-yellow-800' : 'bg-yellow-50 border-yellow-200'}`}>
                    <div className="mb-4">
                      <Loader className={`w-16 h-16 mx-auto ${theme === 'dark' ? 'text-yellow-400' : 'text-yellow-600'}`} />
                    </div>
                    <h3 className={`text-lg font-semibold mb-2 ${theme === 'dark' ? 'text-yellow-100' : 'text-yellow-900'}`}>
                      Connection Pending
                    </h3>
                    <p className={`text-sm mb-4 ${theme === 'dark' ? 'text-yellow-300' : 'text-yellow-700'}`}>
                      The cluster is not yet connected. Make sure you've installed the Helm chart
                      and the agent is running.
                    </p>
                    <button
                      onClick={checkConnection}
                      disabled={checkingConnection}
                      className="px-6 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between px-6 py-4 border-t ${theme === 'dark' ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-gray-200'}`}>
          <button
            onClick={handlePreviousStep}
            disabled={currentStep === 1 || loading}
            className={`px-4 py-2 border rounded-md disabled:opacity-50 disabled:cursor-not-allowed ${theme === 'dark' ? 'text-slate-300 bg-slate-800 border-slate-600 hover:bg-slate-700' : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50'}`}
          >
            Previous
          </button>

          <div className="flex space-x-3">
            <button
              onClick={handleClose}
              className={`px-4 py-2 border rounded-md ${theme === 'dark' ? 'text-slate-300 bg-slate-800 border-slate-600 hover:bg-slate-700' : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50'}`}
            >
              Cancel
            </button>

            {currentStep < 3 && (
              <button
                onClick={handleNextStep}
                disabled={loading}
                className={`px-4 py-2 rounded-md flex items-center text-white ${loading ? theme === 'dark' ? 'bg-slate-600 cursor-not-allowed' : 'bg-gray-400 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-700'}`}
              >
                {loading ? (
                  <>
                    <Loader className="animate-spin mr-2" size={16} />
                    Processing...
                  </>
                ) : (
                  'Next'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddClusterModal;

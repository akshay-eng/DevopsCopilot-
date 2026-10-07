import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchIntegrations,
  saveIntegration,
  deleteIntegration,
  testIntegration
} from '../redux/slices/integrationsSlice';
import { getClusters } from '../services/api';
import { backendApi } from '../services/api';

const Integrations = () => {
  const { theme } = useTheme();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { integrations, loading, error } = useSelector(state => state.integrations);

  const [activeIntegration, setActiveIntegration] = useState(null);
  const [formData, setFormData] = useState({});
  const [showPassword, setShowPassword] = useState({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // MCP deploy prompt state
  const [showDeployPrompt, setShowDeployPrompt] = useState(false);
  const [deployClusters, setDeployClusters] = useState([]);
  const [deployClusterId, setDeployClusterId] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState(null);

  useEffect(() => {
    dispatch(fetchIntegrations());
  }, [dispatch]);

  const integrationTypes = {
    email: {
      name: 'Email',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      fields: [
        { name: 'smtp_host', label: 'SMTP Host', type: 'text', placeholder: 'smtp.gmail.com', required: true },
        { name: 'smtp_port', label: 'SMTP Port', type: 'number', placeholder: '587', required: true },
        { name: 'smtp_user', label: 'Username/Email', type: 'email', placeholder: 'user@example.com', required: true },
        { name: 'smtp_password', label: 'Password', type: 'password', placeholder: '••••••••', required: true },
        { name: 'from_email', label: 'From Email', type: 'email', placeholder: 'alerts@example.com', required: true },
        { name: 'use_tls', label: 'Use TLS', type: 'checkbox', required: false }
      ]
    },
    slack: {
      name: 'Slack',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
        </svg>
      ),
      fields: [
        { name: 'webhook_url', label: 'Webhook URL', type: 'text', placeholder: 'https://hooks.slack.com/services/...', required: true },
        { name: 'channel', label: 'Default Channel', type: 'text', placeholder: '#alerts', required: false },
        { name: 'username', label: 'Bot Username', type: 'text', placeholder: 'AIOps Bot', required: false }
      ]
    },
    teams: {
      name: 'Microsoft Teams',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20.625 8.127h-7.5a.375.375 0 0 0-.375.375v7.5c0 .207.168.375.375.375h7.5a.375.375 0 0 0 .375-.375v-7.5a.375.375 0 0 0-.375-.375zm-11.25-3.75h-6a.375.375 0 0 0-.375.375v11.25c0 .207.168.375.375.375h6a.375.375 0 0 0 .375-.375V4.752a.375.375 0 0 0-.375-.375zM21 0h-9.75a3 3 0 0 0-3 3v1.5H3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h9.75a3 3 0 0 0 3-3V18H21a3 3 0 0 0 3-3V3a3 3 0 0 0-3-3z"/>
        </svg>
      ),
      fields: [
        { name: 'webhook_url', label: 'Webhook URL', type: 'text', placeholder: 'https://outlook.office.com/webhook/...', required: true }
      ]
    },
    argocd: {
      name: 'ArgoCD',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0L1.608 6v12L12 24l10.392-6V6L12 0zm-1.26 5.95h2.52v7.008h-2.52V5.95zm0 8.512h2.52v2.537h-2.52v-2.537z"/>
        </svg>
      ),
      fields: [
        { name: 'server_url', label: 'Server URL', type: 'text', placeholder: 'https://argocd.example.com', required: true },
        { name: 'auth_token', label: 'Auth Token', type: 'password', placeholder: '••••••••', required: true },
        { name: 'insecure', label: 'Skip TLS Verification', type: 'checkbox', required: false }
      ]
    },
    jenkins: {
      name: 'Jenkins',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-.5 1.5c.552 0 1 .448 1 1s-.448 1-1 1-1-.448-1-1 .448-1 1-1zm-3 2c.552 0 1 .448 1 1s-.448 1-1 1-1-.448-1-1 .448-1 1-1zm7 0c.552 0 1 .448 1 1s-.448 1-1 1-1-.448-1-1 .448-1 1-1zM12 4.5c3.59 0 6.5 2.91 6.5 6.5s-2.91 6.5-6.5 6.5-6.5-2.91-6.5-6.5 2.91-6.5 6.5-6.5z"/>
        </svg>
      ),
      fields: [
        { name: 'jenkins_url', label: 'Jenkins URL', type: 'text', placeholder: 'https://jenkins.example.com', required: true },
        { name: 'username', label: 'Username', type: 'text', placeholder: 'admin', required: true },
        { name: 'api_token', label: 'API Token', type: 'password', placeholder: '••••••••', required: true }
      ]
    },
    github: {
      name: 'GitHub',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
        </svg>
      ),
      fields: [
        { name: 'personal_access_token', label: 'Personal Access Token', type: 'password', placeholder: 'ghp_••••••••', required: true },
        { name: 'org_or_user', label: 'Organization/Username', type: 'text', placeholder: 'myorg', required: false }
      ]
    },
    snow: {
      name: 'ServiceNow',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      fields: [
        { name: 'instance_url', label: 'Instance URL', type: 'text', placeholder: 'https://instance.service-now.com', required: true },
        { name: 'username', label: 'Username', type: 'text', placeholder: 'admin', required: true },
        { name: 'password', label: 'Password', type: 'password', placeholder: '••••••••', required: true },
        { name: 'assignment_group', label: 'Default Assignment Group', type: 'text', placeholder: 'IT Support', required: false }
      ]
    },
    jira: {
      name: 'Jira',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0Z"/>
        </svg>
      ),
      fields: [
        { name: 'jira_url', label: 'Jira URL', type: 'text', placeholder: 'https://mycompany.atlassian.net', required: true },
        { name: 'email', label: 'Email', type: 'email', placeholder: 'user@example.com', required: true },
        { name: 'api_token', label: 'API Token', type: 'password', placeholder: '••••••••', required: true },
        { name: 'project_key', label: 'Default Project Key', type: 'text', placeholder: 'OPS', required: false }
      ]
    },
    awx: {
      name: 'AWX / Ansible Tower',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2V7zm0 8h2v2h-2v-2z"/>
          <path d="M7 10l3 3-3 3v-6zm10 0v6l-3-3 3-3z"/>
        </svg>
      ),
      fields: [
        { name: 'host', label: 'AWX/Tower URL', type: 'text', placeholder: 'https://awx.example.com', required: true },
        { name: 'username', label: 'Username', type: 'text', placeholder: 'admin', required: true },
        { name: 'password', label: 'Password', type: 'password', placeholder: '••••••••', required: true },
        { name: 'verify_ssl', label: 'Verify SSL', type: 'checkbox', required: false }
      ]
    },
    aws: {
      name: 'AWS',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6.763 10.036c0 .296.032.535.088.71.064.176.144.368.256.576.04.063.056.127.056.183 0 .08-.048.16-.152.24l-.503.335a.383.383 0 0 1-.208.072c-.08 0-.16-.04-.239-.112a2.47 2.47 0 0 1-.287-.375 6.18 6.18 0 0 1-.248-.471c-.622.734-1.405 1.101-2.347 1.101-.67 0-1.205-.191-1.596-.574-.391-.384-.59-.894-.59-1.533 0-.678.239-1.23.726-1.644.487-.415 1.133-.623 1.955-.623.272 0 .551.024.846.064.296.04.6.104.918.176v-.583c0-.607-.127-1.031-.375-1.277-.255-.246-.686-.367-1.3-.367-.28 0-.568.031-.863.103-.295.072-.583.16-.862.272a2.287 2.287 0 0 1-.28.104.488.488 0 0 1-.127.023c-.112 0-.168-.08-.168-.247v-.391c0-.128.016-.224.056-.28a.597.597 0 0 1 .224-.167c.279-.144.614-.264 1.005-.36C2.982 4.24 3.42 4.192 3.9 4.192c.989 0 1.714.224 2.18.67.455.447.687 1.133.687 2.062v2.112zm-3.24 1.214c.263 0 .534-.048.822-.144.287-.096.543-.271.758-.51.128-.152.224-.32.272-.512.048-.191.08-.423.08-.694v-.335a6.66 6.66 0 0 0-.735-.136 6.02 6.02 0 0 0-.75-.048c-.535 0-.926.104-1.19.32-.263.215-.39.518-.39.917 0 .375.095.655.295.846.191.2.47.296.838.296zm6.41.862c-.144 0-.24-.024-.304-.08-.064-.048-.12-.16-.168-.311L7.586 5.55a1.398 1.398 0 0 1-.072-.32c0-.128.064-.2.191-.2h.783c.151 0 .255.025.31.08.065.048.113.16.16.312l1.342 5.284 1.245-5.284c.04-.16.088-.264.151-.312a.549.549 0 0 1 .32-.08h.638c.152 0 .256.025.32.08.063.048.119.16.151.312l1.261 5.348 1.381-5.348c.048-.16.104-.264.16-.312a.52.52 0 0 1 .311-.08h.743c.127 0 .2.065.2.2 0 .04-.009.08-.017.128a1.137 1.137 0 0 1-.056.2l-1.923 6.17c-.048.16-.104.263-.168.311a.51.51 0 0 1-.303.08h-.687c-.151 0-.255-.024-.32-.08-.063-.056-.119-.16-.15-.32l-1.238-5.148-1.23 5.14c-.04.16-.087.264-.15.32-.065.056-.177.08-.32.08zm10.256.215c-.415 0-.83-.048-1.229-.143-.399-.096-.71-.2-.918-.32-.128-.071-.215-.151-.247-.223a.563.563 0 0 1-.048-.224v-.407c0-.167.064-.247.183-.247.048 0 .096.008.144.024.048.016.12.048.2.08.271.12.566.215.878.279.319.064.63.096.95.096.502 0 .894-.088 1.165-.264a.86.86 0 0 0 .415-.758.777.777 0 0 0-.215-.559c-.144-.151-.415-.287-.807-.415l-1.157-.36c-.583-.183-1.014-.454-1.277-.807-.255-.35-.386-.742-.386-1.157 0-.335.072-.63.216-.886.144-.255.335-.479.575-.662.239-.184.51-.32.83-.414.32-.096.655-.136 1.006-.136.175 0 .359.008.535.032.183.024.35.056.518.088.16.04.312.08.455.127.144.048.256.096.336.144a.69.69 0 0 1 .24.2.43.43 0 0 1 .071.263v.375c0 .168-.064.256-.184.256-.063 0-.167-.032-.296-.096-.462-.216-.974-.32-1.532-.32-.455 0-.815.071-1.062.223-.248.152-.375.391-.375.718 0 .224.08.423.24.59.159.168.447.335.863.479l1.134.36c.574.183.99.438 1.237.767.247.327.367.702.367 1.117 0 .343-.072.655-.207.926-.144.272-.335.511-.583.703-.247.2-.543.343-.886.447-.36.111-.734.167-1.142.167z"/>
        </svg>
      ),
      fields: [
        { name: 'access_key_id', label: 'Access Key ID', type: 'text', placeholder: 'AKIAIOSFODNN7EXAMPLE', required: true },
        { name: 'secret_access_key', label: 'Secret Access Key', type: 'password', placeholder: '••••••••', required: true },
        { name: 'region', label: 'Default Region', type: 'text', placeholder: 'us-east-1', required: true },
        { name: 'sns_topic_arn', label: 'SNS Topic ARN (Optional)', type: 'text', placeholder: 'arn:aws:sns:us-east-1:123456789012:alerts', required: false }
      ]
    },
    milvus: {
      name: 'Milvus DB',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2L3 7v10l9 5 9-5V7l-9-5zm0 2.18L18.36 7.5 12 10.82 5.64 7.5 12 4.18zM5 8.82l6 3.33v7.03l-6-3.33V8.82zm8 10.36v-7.03l6-3.33v7.03l-6 3.33z"/>
        </svg>
      ),
      fields: [
        { name: 'host', label: 'Milvus Host', type: 'text', placeholder: '192.168.1.5 (IP or hostname, no http://)', required: true },
        { name: 'port', label: 'Port', type: 'text', placeholder: '19530', required: true },
        { name: 'username', label: 'Username', type: 'text', placeholder: 'root', required: false },
        { name: 'password', label: 'Password', type: 'password', placeholder: '••••••••', required: false }
      ]
    }
  };

  // ---- Modular registry: the backend manifest is the source of truth ----
  const [registryDefs, setRegistryDefs] = useState(null);
  useEffect(() => {
    backendApi.get('/api/integrations/registry')
      .then((r) => setRegistryDefs(r?.integrations || null))
      .catch(() => setRegistryDefs(null));
  }, []);

  const genericIcon = (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );

  // Merge the backend registry over the local defs so a new manifest entry shows
  // up automatically (generic icon + its declared fields); existing integrations
  // keep their nicer local icons.
  const effectiveTypes = (registryDefs && registryDefs.length)
    ? registryDefs.reduce((acc, r) => {
        const local = integrationTypes[r.id] || {};
        acc[r.id] = {
          ...local,
          name: r.name || local.name,
          description: r.description || local.description,
          category: r.category || local.category,
          icon: local.icon || genericIcon,
          // Base (non-auth) fields. When the manifest declares authMethods the
          // base list may legitimately be empty (e.g. Teams = webhook only), so
          // only fall back to the local defs when there are no authMethods.
          fields: (r.fields && r.fields.length)
            ? r.fields
            : ((r.authMethods && r.authMethods.length) ? [] : (local.fields || [])),
          authMethods: r.authMethods || [],
        };
        return acc;
      }, { ...integrationTypes })
    : integrationTypes;

  // ---- Auth method selection (basic / PAT / OAuth / webhook …) -------------
  const activeManifest = (activeIntegration && effectiveTypes[activeIntegration]) || null;
  const authMethods = activeManifest?.authMethods || [];
  const selectedAuthId = formData.auth_method || authMethods.find((a) => a.default)?.id || authMethods[0]?.id;
  const activeAuth = authMethods.find((a) => a.id === selectedAuthId) || null;
  // Fields actually shown = base config + the chosen auth method's fields.
  const visibleFields = activeManifest
    ? [...(activeManifest.fields || []), ...((activeAuth && activeAuth.fields) || [])]
    : [];

  const handleOAuthConnect = async () => {
    try {
      const r = await backendApi.get(`/api/integrations/${activeIntegration}/oauth/authorize-url`);
      if (r?.authorizeUrl) {
        window.open(r.authorizeUrl, 'aiops-oauth', 'width=980,height=820');
      } else {
        alert(r?.error || 'Could not start the OAuth flow.');
      }
    } catch (e) {
      alert(e.message || 'Could not start the OAuth flow.');
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Client-side validation before save/test
  const validateForm = () => {
    const type = effectiveTypes[activeIntegration];
    if (!type) return 'Unknown integration type';
    // Only the fields actually shown (base + selected auth method) are required.
    const checkFields = visibleFields.length ? visibleFields : (type.fields || []);
    const missing = checkFields
      .filter(f => f.required && !formData[f.name])
      .map(f => f.label);
    if (missing.length > 0) return `Please fill in: ${missing.join(', ')}`;
    // URL validation
    const urlFields = checkFields.filter(f => f.type === 'url' || (f.type === 'text' && (f.name.includes('url') || (f.name === 'host' && activeIntegration !== 'milvus') || f.name === 'instance_url' || f.name === 'server_url' || f.name === 'jenkins_url' || f.name === 'jira_url')));
    for (const f of urlFields) {
      if (formData[f.name] && !/^https?:\/\/.+/i.test(formData[f.name])) {
        return `${f.label} must start with http:// or https://`;
      }
    }
    return null;
  };

  // Integration types that have a deployable MCP server
  const mcpDeployableIntegrations = ['snow'];

  const handleSave = async () => {
    const validationError = validateForm();
    if (validationError) {
      setTestResult({ success: false, message: validationError });
      setTimeout(() => setTestResult(null), 5000);
      return;
    }
    try {
      await dispatch(saveIntegration({
        type: activeIntegration,
        config: formData
      })).unwrap();

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);

      // If this integration has a deployable MCP server, prompt user
      if (mcpDeployableIntegrations.includes(activeIntegration)) {
        try {
          const clustersData = await getClusters();
          const clusterList = clustersData.clusters || [];
          if (clusterList.length > 0) {
            setDeployClusters(clusterList);
            setDeployClusterId(clusterList[0]._id);
            setDeployResult(null);
            setShowDeployPrompt(true);
          }
        } catch (clErr) {
          console.error('Failed to fetch clusters for MCP deploy:', clErr);
        }
      }
    } catch (err) {
      setTestResult({ success: false, message: typeof err === 'string' ? err : (err?.message || 'Failed to save integration') });
      setTimeout(() => setTestResult(null), 5000);
    }
  };

  const handleDeployMcp = async () => {
    if (!deployClusterId || !activeIntegration) return;
    setDeploying(true);
    setDeployResult(null);
    try {
      const result = await backendApi.post('/api/mcp-catalog/deploy-from-integration', {
        integrationType: activeIntegration,
        clusterId: deployClusterId,
      });
      setDeployResult({ success: true, message: result.message || 'MCP server deployed successfully!' });
      setTimeout(() => setShowDeployPrompt(false), 3000);
    } catch (err) {
      setDeployResult({ success: false, message: err.message || 'Failed to deploy MCP server' });
    } finally {
      setDeploying(false);
    }
  };

  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    const validationError = validateForm();
    if (validationError) {
      setTestResult({ success: false, message: validationError });
      setTimeout(() => setTestResult(null), 5000);
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await dispatch(testIntegration({
        type: activeIntegration,
        config: formData
      })).unwrap();

      setTestResult(result);
      setTimeout(() => setTestResult(null), 8000);
    } catch (err) {
      setTestResult({ success: false, message: typeof err === 'string' ? err : (err?.message || 'Connection test failed') });
      setTimeout(() => setTestResult(null), 8000);
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this integration?')) {
      try {
        await dispatch(deleteIntegration(activeIntegration)).unwrap();
        setActiveIntegration(null);
        setFormData({});
      } catch (err) {
        console.error('Failed to delete integration:', err);
      }
    }
  };

  const togglePasswordVisibility = (fieldName) => {
    setShowPassword(prev => ({
      ...prev,
      [fieldName]: !prev[fieldName]
    }));
  };

  const getIntegrationStatus = (type) => {
    return integrations?.[type]?.enabled || false;
  };

  useEffect(() => {
    if (activeIntegration && integrations?.[activeIntegration]) {
      setFormData(integrations[activeIntegration].config || {});
    } else {
      setFormData({});
    }
  }, [activeIntegration, integrations]);

  // ---- Category grouping, search and filtering ---------------------------
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [onlyConfigured, setOnlyConfigured] = useState(false);

  // Mirrors CATEGORY_ORDER in authService/config/integrationRegistry.js so the
  // backend grouping and this one cannot drift apart.
  const CATEGORY_ORDER = [
    'ITSM', 'On-call', 'Observability', 'Cost', 'Source & CI', 'GitOps',
    'Automation', 'Registry & Security', 'Cloud', 'Notifications', 'Vector DB',
  ];

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (key, i) => {
      if (onlyConfigured && !(integrations && integrations[key] && integrations[key].enabled)) return false;
      if (!q) return true;
      return [key, i.name, i.description, i.category]
        .some((v) => String(v || '').toLowerCase().includes(q));
    };
    const buckets = new Map();
    Object.entries(effectiveTypes).forEach((entry) => {
      const cat = entry[1].category || 'Other';
      if (!buckets.has(cat)) buckets.set(cat, { name: cat, items: [], all: 0 });
      const b = buckets.get(cat);
      b.all += 1;
      if ((activeCategory === 'All' || activeCategory === cat) && matches(entry[0], entry[1])) {
        b.items.push(entry);
      }
    });
    const rank = (c) => {
      const i = CATEGORY_ORDER.indexOf(c);
      return i === -1 ? CATEGORY_ORDER.length : i;
    };
    return Array.from(buckets.values())
      .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTypes, query, activeCategory, onlyConfigured, integrations]);

  const categoryNames = useMemo(() => grouped.map((g) => g.name), [grouped]);
  const visibleCount = useMemo(() => grouped.reduce((n, g) => n + g.items.length, 0), [grouped]);
  const totalCount = Object.keys(effectiveTypes).length;

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            Integrations
          </h1>
          <p className={`mt-2 text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
            Connect your tools and services to receive alerts and automate workflows
          </p>
        </div>

        {/* Search + category filter - a flat list of 40 integrations is unusable */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <svg className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search integrations..."
              className={`w-full pl-9 pr-3 py-2 rounded border text-sm ${
                theme === 'dark'
                  ? 'bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-violet-500'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
              } focus:outline-none`}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className={`text-xs cursor-pointer ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
              <input type="checkbox" checked={onlyConfigured} onChange={(e) => setOnlyConfigured(e.target.checked)}
                className="w-3.5 h-3.5 mr-1.5 align-middle rounded border-slate-600 text-violet-500 focus:ring-violet-500" />
              Connected only
            </label>
            <span className={`text-xs whitespace-nowrap ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'}`}>
              {visibleCount} of {totalCount}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {['All'].concat(categoryNames).map((cat) => {
            const active = activeCategory === cat;
            const n = cat === 'All' ? totalCount : ((grouped.find((g) => g.name === cat) || {}).all || 0);
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? theme === 'dark' ? 'bg-violet-500/15 border-violet-500 text-violet-300' : 'bg-blue-50 border-blue-500 text-blue-700'
                    : theme === 'dark' ? 'bg-[#13131f] border-slate-700 text-slate-400 hover:border-slate-600' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {cat}
                <span className={`ml-1.5 ${active ? '' : theme === 'dark' ? 'text-slate-600' : 'text-gray-400'}`}>{n}</span>
              </button>
            );
          })}
        </div>

        {visibleCount === 0 && (
          <div className={`mb-8 py-10 text-center text-sm ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'}`}>
            No integrations match this filter.
          </div>
        )}

        {grouped.map((group) => group.items.length === 0 ? null : (
          <div key={group.name} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <h2 className={`text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>
                {group.name}
              </h2>
              <span className={`text-xs ${theme === 'dark' ? 'text-slate-600' : 'text-gray-400'}`}>{group.items.length}</span>
              <div className={`flex-1 h-px ${theme === 'dark' ? 'bg-slate-800' : 'bg-gray-200'}`} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {group.items.map((entry) => {
                const key = entry[0];
                const integration = entry[1];
                const isConfigured = getIntegrationStatus(key);
                return (
                  <button
                    key={key}
                    onClick={() => setActiveIntegration(key)}
                    title={integration.description || integration.name}
                    className={`p-4 rounded-lg border-2 transition-all text-center ${
                      activeIntegration === key
                        ? theme === 'dark'
                          ? 'border-violet-500 bg-violet-500/10'
                          : 'border-blue-500 bg-blue-50'
                        : theme === 'dark'
                        ? 'border-slate-700 bg-[#13131f] hover:border-slate-600'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex flex-col items-center space-y-2">
                      <div className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                        {integration.icon}
                      </div>
                      <div>
                        <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                          {integration.name}
                        </h3>
                        <div className="flex items-center justify-center space-x-1 mt-1">
                          {isConfigured && <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>}
                          <p className={`text-xs ${isConfigured ? 'text-green-400' : theme === 'dark' ? 'text-slate-500' : 'text-gray-500'}`}>
                            {isConfigured ? 'Connected' : 'Not configured'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="grid grid-cols-1 gap-6">

          {/* Configuration Form */}
          <div>
            {activeIntegration ? (
              <div className={`rounded-lg border ${theme === 'dark' ? 'bg-[#13131f] border-slate-700' : 'bg-white border-gray-200'}`}>
                {/* Sticky header */}
                <div className={`sticky top-0 z-10 px-6 py-4 rounded-t-lg border-b ${theme === 'dark' ? 'bg-[#13131f] border-slate-700' : 'bg-white border-gray-200'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                        {effectiveTypes[activeIntegration].icon}
                      </div>
                      <div>
                        <h2 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                          {effectiveTypes[activeIntegration].name}
                        </h2>
                        <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                          Configure your {effectiveTypes[activeIntegration].name} integration
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      {/* Action Buttons in header */}
                      <button
                        onClick={handleTest}
                        disabled={loading}
                        className={`px-4 py-2 rounded font-medium border transition-colors text-sm ${
                          theme === 'dark'
                            ? 'border-slate-600 text-slate-300 hover:bg-slate-800'
                            : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        Test Connection
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={loading}
                        className={`px-4 py-2 rounded font-medium transition-colors text-sm ${
                          theme === 'dark'
                            ? 'bg-violet-600 hover:bg-violet-700 text-white'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {loading ? 'Saving...' : 'Save Configuration'}
                      </button>
                      {getIntegrationStatus(activeIntegration) && (
                        <button
                          onClick={handleDelete}
                          className={`px-3 py-2 text-sm rounded ${theme === 'dark' ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-red-50 text-red-600 hover:bg-red-100'} transition-colors`}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Success/Error Messages */}
                  {saveSuccess && (
                    <div className="mt-3 p-2 bg-green-500/10 border border-green-500/20 rounded text-green-400 text-sm flex items-center space-x-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Integration saved successfully!</span>
                    </div>
                  )}

                  {testResult && (
                    <div className={`mt-3 p-2 border rounded text-sm flex items-center space-x-2 ${
                      testResult.success
                        ? 'bg-green-500/10 border-green-500/20 text-green-400'
                        : 'bg-red-500/10 border-red-500/20 text-red-400'
                    }`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {testResult.success ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        )}
                      </svg>
                      <span>{testResult.message || (testResult.success ? 'Connection successful!' : 'Connection failed!')}</span>
                    </div>
                  )}
                </div>

                {/* Scrollable Form Fields */}
                <div className="px-6 py-4 max-h-[400px] overflow-y-auto space-y-4">
                  {/* Authentication method picker */}
                  {authMethods.length > 1 && (
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
                        Authentication method
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {authMethods.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => handleInputChange('auth_method', m.id)}
                            className={`px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-colors ${
                              selectedAuthId === m.id
                                ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                                : theme === 'dark'
                                  ? 'border-slate-700 text-slate-400 hover:bg-slate-800'
                                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* OAuth: save client id/secret, then authorize in a popup */}
                  {activeAuth?.oauth && (
                    <div className={`rounded-lg border p-3 flex items-start gap-3 ${theme === 'dark' ? 'border-slate-700 bg-slate-800/40' : 'border-blue-100 bg-blue-50'}`}>
                      <div className="flex-1">
                        <p className={`text-[13px] font-medium ${theme === 'dark' ? 'text-slate-200' : 'text-blue-900'}`}>OAuth 2.0 authorization</p>
                        <p className={`text-[12px] mt-0.5 ${theme === 'dark' ? 'text-slate-400' : 'text-blue-700'}`}>
                          Save the Client ID &amp; Secret below first, then authorize. Tokens are stored encrypted and refreshed automatically.
                          {activeAuth.scopes?.length ? ` Scopes: ${activeAuth.scopes.join(', ')}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleOAuthConnect}
                        className="shrink-0 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        Connect
                      </button>
                    </div>
                  )}

                  {visibleFields.map((field) => (
                    <div key={field.name}>
                      <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      {field.type === 'textarea' ? (
                        <textarea
                          value={formData[field.name] || ''}
                          onChange={(e) => handleInputChange(field.name, e.target.value)}
                          placeholder={field.placeholder}
                          required={field.required}
                          rows={5}
                          spellCheck={false}
                          className={`w-full px-3 py-2 rounded border font-mono text-xs resize-y ${
                            theme === 'dark'
                              ? 'bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-violet-500'
                              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
                          } focus:outline-none focus:ring-1 ${
                            theme === 'dark' ? 'focus:ring-violet-500' : 'focus:ring-blue-500'
                          }`}
                        />
                      ) : field.type === 'select' ? (
                        <select
                          value={formData[field.name] || ''}
                          onChange={(e) => handleInputChange(field.name, e.target.value)}
                          className={`w-full px-3 py-2 rounded border ${
                            theme === 'dark'
                              ? 'bg-slate-800 border-slate-600 text-white focus:border-violet-500'
                              : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
                          } focus:outline-none focus:ring-1 ${
                            theme === 'dark' ? 'focus:ring-violet-500' : 'focus:ring-blue-500'
                          }`}
                        >
                          <option value="">Select…</option>
                          {(field.options || []).map((o) => {
                            const val = typeof o === 'string' ? o : o.value;
                            const lbl = typeof o === 'string' ? o : (o.label || o.value);
                            return <option key={val} value={val}>{lbl}</option>;
                          })}
                        </select>
                      ) : field.type === 'checkbox' ? (
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData[field.name] || false}
                            onChange={(e) => handleInputChange(field.name, e.target.checked)}
                            className="w-4 h-4 rounded border-slate-600 text-violet-500 focus:ring-violet-500"
                          />
                          <span className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                            {/* The label already reads as an action ("Skip TLS
                                verification"), so prefixing "Enable" garbles it. */}
                            {field.label}
                          </span>
                        </label>
                      ) : (
                        <div className="relative">
                          <input
                            type={field.type === 'password' && showPassword[field.name] ? 'text' : field.type}
                            value={formData[field.name] || ''}
                            onChange={(e) => handleInputChange(field.name, e.target.value)}
                            placeholder={field.placeholder}
                            required={field.required}
                            className={`w-full px-3 py-2 rounded border ${
                              theme === 'dark'
                                ? 'bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-violet-500'
                                : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
                            } focus:outline-none focus:ring-1 ${
                              theme === 'dark' ? 'focus:ring-violet-500' : 'focus:ring-blue-500'
                            }`}
                          />
                          {field.type === 'password' && (
                            <button
                              type="button"
                              onClick={() => togglePasswordVisibility(field.name)}
                              className={`absolute right-3 top-1/2 -translate-y-1/2 ${theme === 'dark' ? 'text-slate-400 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                              {showPassword[field.name] ? (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                </svg>
                              ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              )}
                            </button>
                          )}
                        </div>
                      )}
                      {field.help && (
                        <p className={`mt-1 text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'}`}>
                          {field.help}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {error && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm flex items-center space-x-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{error}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className={`p-12 rounded-lg border-2 border-dashed ${theme === 'dark' ? 'border-slate-700' : 'border-gray-300'}`}>
                <div className="text-center">
                  <svg className={`mx-auto w-12 h-12 ${theme === 'dark' ? 'text-slate-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <h3 className={`mt-4 text-lg font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    Select an integration
                  </h3>
                  <p className={`mt-2 text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                    Choose an integration from above to configure it
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MCP Deploy Prompt Modal */}
      {showDeployPrompt && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={() => !deploying && setShowDeployPrompt(false)} />
          <div className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[520px] rounded-2xl shadow-2xl border overflow-hidden ${theme === 'dark' ? 'bg-[#13131f] border-slate-700' : 'bg-white border-gray-200'}`}>
            {/* Header with gradient */}
            <div className={`px-6 py-5 ${theme === 'dark' ? 'bg-gradient-to-r from-violet-600/20 to-purple-600/10 border-b border-slate-700/50' : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${theme === 'dark' ? 'bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25' : 'bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25'}`}>
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" /></svg>
                </div>
                <div>
                  <h3 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    Deploy ServiceNow MCP Server
                  </h3>
                  <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>
                    Your credentials are saved. Deploy the MCP server to your cluster?
                  </p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              <div className={`rounded-xl border p-4 ${theme === 'dark' ? 'bg-slate-800/50 border-slate-700/50' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🔧</span>
                  <div>
                    <div className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>ServiceNow MCP Server</div>
                    <div className={`text-xs mt-0.5 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>
                      25+ tools for incident management, change requests, and natural language search
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {['Incidents', 'Changes', 'NLP Search', 'Comments'].map(tag => (
                        <span key={tag} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${theme === 'dark' ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20' : 'bg-blue-50 text-blue-600 border border-blue-200'}`}>{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Cluster selector */}
              <div>
                <label className={`block text-sm font-medium mb-1.5 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>Deploy to Cluster</label>
                <select
                  value={deployClusterId}
                  onChange={(e) => setDeployClusterId(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-lg border ${theme === 'dark' ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'} focus:outline-none focus:ring-2 ${theme === 'dark' ? 'focus:ring-violet-500' : 'focus:ring-blue-500'}`}
                >
                  {deployClusters.map(c => (
                    <option key={c._id} value={c._id}>{c.name || c._id}</option>
                  ))}
                </select>
              </div>

              {/* Info */}
              <div className={`flex items-start gap-2.5 text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'}`}>
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>Your ServiceNow credentials will be securely injected as environment variables. The MCP server will be deployed in the <code className="font-mono">mcp-servers</code> namespace and will appear in the MCP Catalogue.</span>
              </div>

              {/* Deploy result */}
              {deployResult && (
                <div className={`p-3 rounded-lg text-sm ${deployResult.success
                  ? (theme === 'dark' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-green-50 border border-green-200 text-green-700')
                  : (theme === 'dark' ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-red-50 border border-red-200 text-red-700')
                }`}>
                  <div className="flex items-center gap-2">
                    {deployResult.success ? (
                      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    )}
                    <span>{deployResult.message}</span>
                  </div>
                  {deployResult.success && (
                    <button
                      onClick={() => { setShowDeployPrompt(false); navigate('/dashboard/ai-workloads/mcp-catalog'); }}
                      className={`mt-2.5 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${theme === 'dark' ? 'bg-violet-500/15 text-violet-400 hover:bg-violet-500/25' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      Go to MCP Catalogue Instances to monitor
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className={`px-6 py-4 border-t ${theme === 'dark' ? 'border-slate-700/50 bg-slate-900/30' : 'border-gray-100 bg-gray-50/50'} flex items-center justify-end gap-3`}>
              <button
                onClick={() => setShowDeployPrompt(false)}
                disabled={deploying}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${theme === 'dark' ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Skip for Now
              </button>
              <button
                onClick={handleDeployMcp}
                disabled={deploying || !deployClusterId || deployResult?.success}
                className={`px-5 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-40 flex items-center gap-2 ${theme === 'dark'
                  ? 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-500/20'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/20'
                }`}
              >
                {deploying ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Deploying...
                  </>
                ) : deployResult?.success ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Deployed
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" /></svg>
                    Deploy MCP Server
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Integrations;

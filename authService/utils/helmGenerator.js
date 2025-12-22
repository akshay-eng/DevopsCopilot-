// Helm chart installation command generator
const generateHelmCommand = (clusterData, credentials) => {
  const { name, clusterType } = clusterData;
  const { agentId, apiKey, userId, clusterId } = credentials;

  // Base Helm command
  const helmCommand = `helm repo add devopscopilot https://charts.devopscopilot.io
helm repo update
helm install devopscopilot devopscopilot/agent \\
  --namespace devopscopilot --create-namespace \\
  --set agent.apiKey="${apiKey}" \\
  --set agent.agentId="${agentId}" \\
  --set agent.userId="${userId}" \\
  --set agent.clusterId="${clusterId}" \\
  --set agent.clusterName="${name}" \\
  --set agent.clusterType="${clusterType}" \\
  --set agent.kafkaBootstrapServers="kafka.devopscopilot.io:9092"`;

  return helmCommand;
};

// Generate Helm values YAML (for download)
const generateHelmValues = (clusterData, credentials) => {
  const { name, clusterType } = clusterData;
  const { agentId, apiKey, userId, clusterId } = credentials;

  const valuesYaml = `# DevOps Copilot Agent Configuration
# Generated for cluster: ${name}

agent:
  apiKey: "${apiKey}"
  agentId: "${agentId}"
  userId: "${userId}"
  clusterId: "${clusterId}"
  clusterName: "${name}"
  clusterType: "${clusterType}"

  # Kafka Configuration (SaaS Backend)
  kafkaBootstrapServers: "kafka.devopscopilot.io:9092"

  # Image configuration
  image:
    repository: devopscopilot/agent
    tag: "latest"
    pullPolicy: IfNotPresent

# Monitoring Stack Configuration
prometheus:
  enabled: true

loki:
  enabled: true

grafana:
  enabled: true
  adminPassword: "admin"

# Cilium/Hubble for service mesh observability
cilium:
  enabled: true
  hubble:
    enabled: true
    relay:
      enabled: true
`;

  return valuesYaml;
};

// Generate installation instructions
const generateInstallationInstructions = (helmCommand) => {
  return {
    steps: [
      {
        title: "Install Helm",
        description: "If you don't have Helm installed, install it first",
        command: "curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash",
        optional: true
      },
      {
        title: "Add DevOps Copilot Helm Repository",
        description: "Add our Helm chart repository to your Helm configuration",
        command: "helm repo add devopscopilot https://charts.devopscopilot.io\nhelm repo update"
      },
      {
        title: "Install the DevOps Copilot Agent",
        description: "This will install the agent and monitoring stack in your cluster",
        command: helmCommand,
        warning: "This command contains your unique API key. Do not share it publicly."
      },
      {
        title: "Verify Installation",
        description: "Check if the agent is running successfully",
        command: "kubectl get pods -n devopscopilot"
      },
      {
        title: "Check Agent Logs",
        description: "View agent logs to ensure connectivity",
        command: "kubectl logs -n devopscopilot -l app=devopscopilot-agent --tail=50"
      }
    ],
    troubleshooting: [
      {
        issue: "Pods not starting",
        solution: "Check if your cluster has enough resources. Run: kubectl describe pods -n devopscopilot"
      },
      {
        issue: "Connection timeout",
        solution: "Ensure your cluster can reach kafka.devopscopilot.io:9092. Check firewall rules."
      },
      {
        issue: "Permission denied",
        solution: "Ensure you have cluster-admin permissions or necessary RBAC roles."
      }
    ]
  };
};

module.exports = {
  generateHelmCommand,
  generateHelmValues,
  generateInstallationInstructions
};

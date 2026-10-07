// Framework and LLM Provider data for AgentOps integration

export const FRAMEWORKS = [
    {
        id: 'crewai',
        name: 'CrewAI',
        description: 'Create AI agents that work together',
        icon: '🤖',
        category: 'framework',
        installCommand: 'pip install crewai agentops',
        setupCode: `import agentops
from crewai import Agent, Task, Crew

agentops.init(api_key="YOUR_API_KEY")

# Your CrewAI code here
agent = Agent(role="Assistant", goal="Help users")
task = Task(description="Complete task", agent=agent)
crew = Crew(agents=[agent], tasks=[task])
crew.kickoff()`,
    },
    {
        id: 'agno',
        name: 'Agno',
        description: 'Function-calling orchestration platform',
        icon: '⚡',
        category: 'framework',
        installCommand: 'pip install agno agentops',
        setupCode: `import agentops
import agno

agentops.init(api_key="YOUR_API_KEY")

# Your Agno code here`,
    },
    {
        id: 'typescript',
        name: 'Typescript',
        description: 'JavaScript/TypeScript SDK for OpenAI Agents',
        icon: 'TS',
        category: 'framework',
        installCommand: 'npm install agentops',
        setupCode: `import { AgentOps } from 'agentops';

const agentops = new AgentOps({ apiKey: 'YOUR_API_KEY' });

// Your TypeScript code here`,
    },
    {
        id: 'openai-agents-sdk',
        name: 'OpenAI Agents SDK',
        description: "Build with OpenAI's latest agent framework",
        icon: '🔮',
        category: 'framework',
        installCommand: 'pip install openai agentops',
        setupCode: `import agentops
from openai import OpenAI

agentops.init(api_key="YOUR_API_KEY")
client = OpenAI()

# Your OpenAI Agents code here`,
    },
    {
        id: 'google-aidx',
        name: 'Google AIDX',
        description: "Google's modular framework for developing and deploying AI agents",
        icon: 'G',
        category: 'framework',
        installCommand: 'pip install google-aidx agentops',
        setupCode: `import agentops

agentops.init(api_key="YOUR_API_KEY")

# Your Google AIDX code here`,
    },
    {
        id: 'ag2',
        name: 'AG2',
        description: 'Next-gen multi-agent framework',
        icon: '🔧',
        category: 'framework',
        installCommand: 'pip install ag2 agentops',
        setupCode: `import agentops

agentops.init(api_key="YOUR_API_KEY")

# Your AG2 code here`,
    },
    {
        id: 'autogen',
        name: 'AutoGen',
        description: "Microsoft's multi-agent conversation framework",
        icon: '🤖',
        category: 'framework',
        installCommand: 'pip install pyautogen agentops',
        setupCode: `import agentops
import autogen

agentops.init(api_key="YOUR_API_KEY")

# Your AutoGen code here`,
    },
    {
        id: 'langgraph',
        name: 'LangGraph',
        description: 'Build stateful, multi-actor applications with LLMs',
        icon: '🕸️',
        category: 'framework',
        installCommand: 'pip install langgraph agentops',
        setupCode: `import agentops
from langgraph.graph import StateGraph

agentops.init(api_key="YOUR_API_KEY")

# Your LangGraph code here`,
    },
    {
        id: 'smolagents',
        name: 'smolagents',
        description: "Hugging Face's lightweight agent framework",
        icon: '🤗',
        category: 'framework',
        installCommand: 'pip install smolagents agentops',
        setupCode: `import agentops

agentops.init(api_key="YOUR_API_KEY")

# Your smolagents code here`,
    },
    {
        id: 'llamaindex',
        name: 'LlamaIndex',
        description: 'Data framework for LLM applications',
        icon: '🦙',
        category: 'framework',
        installCommand: 'pip install llama-index agentops',
        setupCode: `import agentops
from llama_index import VectorStoreIndex

agentops.init(api_key="YOUR_API_KEY")

# Your LlamaIndex code here`,
    },
    {
        id: 'camelai',
        name: 'CamelAI',
        description: 'Communicative Agents for Large-Scale Collaboration',
        icon: '🐫',
        category: 'framework',
        installCommand: 'pip install camel-ai agentops',
        setupCode: `import agentops

agentops.init(api_key="YOUR_API_KEY")

# Your CamelAI code here`,
    },
    {
        id: 'llamastack',
        name: 'LlamaStack',
        description: 'Memory-aware LLM development stack',
        icon: '📚',
        category: 'framework',
        installCommand: 'pip install llamastack agentops',
        setupCode: `import agentops

agentops.init(api_key="YOUR_API_KEY")

# Your LlamaStack code here`,
    },
    {
        id: 'mem0',
        name: 'Mem0',
        description: 'Memory layer for AI applications',
        icon: '🧠',
        category: 'framework',
        installCommand: 'pip install mem0ai agentops',
        setupCode: `import agentops

agentops.init(api_key="YOUR_API_KEY")

# Your Mem0 code here`,
    },
    {
        id: 'taskweaver',
        name: 'TaskWeaver',
        description: 'Code-first agent framework for complex tasks',
        icon: '🕷️',
        category: 'framework',
        installCommand: 'pip install taskweaver agentops',
        setupCode: `import agentops

agentops.init(api_key="YOUR_API_KEY")

# Your TaskWeaver code here`,
    },
    {
        id: 'custom',
        name: 'Custom Integration',
        description: 'Use AgentOps with any Python project',
        icon: '⚙️',
        category: 'framework',
        installCommand: 'pip install agentops',
        setupCode: `import agentops

agentops.init(api_key="YOUR_API_KEY")

# Your custom code here
# AgentOps will automatically track your LLM calls`,
    },
];

export const LLM_PROVIDERS = [
    {
        id: 'openai',
        name: 'OpenAI',
        description: 'GPT-4, GPT-3.5, and more',
        icon: '🤖',
        category: 'llm',
    },
    {
        id: 'anthropic',
        name: 'Anthropic',
        description: 'Claude models',
        icon: '🧠',
        category: 'llm',
    },
    {
        id: 'google',
        name: 'Google',
        description: 'Gemini and PaLM',
        icon: 'G',
        category: 'llm',
    },
    {
        id: 'cohere',
        name: 'Cohere',
        description: 'Command and Embed models',
        icon: '🔮',
        category: 'llm',
    },
    {
        id: 'huggingface',
        name: 'Hugging Face',
        description: 'Open source models',
        icon: '🤗',
        category: 'llm',
    },
];

export const getFrameworkById = (id) => {
    return FRAMEWORKS.find((f) => f.id === id);
};

export const getLLMProviderById = (id) => {
    return LLM_PROVIDERS.find((p) => p.id === id);
};

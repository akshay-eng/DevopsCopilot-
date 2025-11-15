import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

const HolmesGPT = () => {
  const { theme } = useTheme();
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { id: 1, title: 'Kubernetes Debugging', timestamp: '2 hours ago', preview: 'Help me debug pod crashes...' },
    { id: 2, title: 'Alert Investigation', timestamp: 'Yesterday', preview: 'Why are my alerts firing...' },
    { id: 3, title: 'Service Issues', timestamp: '2 days ago', preview: 'Service dependency analysis...' }
  ]);
  const [showHistory, setShowHistory] = useState(false);
  const [currentChat, setCurrentChat] = useState(null);
  const messagesEndRef = useRef(null);

  const suggestedPrompts = [
    "Analyze recent pod failures in production",
    "Why is my service experiencing high latency?",
    "Show me alerts from the past 24 hours",
    "Help me troubleshoot network issues"
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: inputValue,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages([...messages, userMessage]);
    setInputValue('');

    // Simulate AI response
    setTimeout(() => {
      const aiMessage = {
        id: Date.now() + 1,
        type: 'ai',
        content: "I'm analyzing your infrastructure and logs. Based on the patterns I've detected, here are my findings...",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, aiMessage]);
    }, 1000);
  };

  const handleNewChat = () => {
    setMessages([]);
    setCurrentChat(null);
  };

  const handlePromptClick = (prompt) => {
    setInputValue(prompt);
  };

  return (
    <div className={`h-full flex relative ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
      {/* Sidebar with Chat History */}
      <div className={`${showHistory ? 'w-64' : 'w-0'} transition-all duration-300 overflow-hidden ${
        theme === 'dark' ? 'bg-[#13131f] border-r border-gray-800' : 'bg-white border-r border-gray-200'
      }`}>
        <div className="p-4 h-full flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              History
            </h3>
            <button
              onClick={() => setShowHistory(false)}
              className={`p-1 rounded ${theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <button
            onClick={handleNewChat}
            className="w-full mb-3 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-medium flex items-center justify-center space-x-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>New Chat</span>
          </button>

          <div className="flex-1 overflow-y-auto space-y-2">
            {chatHistory.map((chat) => (
              <button
                key={chat.id}
                onClick={() => setCurrentChat(chat.id)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  currentChat === chat.id
                    ? theme === 'dark'
                      ? 'bg-purple-500/20 border border-purple-500/30'
                      : 'bg-purple-50 border border-purple-200'
                    : theme === 'dark'
                      ? 'hover:bg-gray-800'
                      : 'hover:bg-gray-50'
                }`}
              >
                <div className={`text-sm font-medium mb-1 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {chat.title}
                </div>
                <div className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'} mb-1`}>
                  {chat.timestamp}
                </div>
                <div className={`text-xs ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'} truncate`}>
                  {chat.preview}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative">
        {/* Toggle History Button */}
        {!showHistory && (
          <button
            onClick={() => setShowHistory(true)}
            className={`absolute top-4 left-4 z-10 p-2 rounded-lg ${
              theme === 'dark' ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-50 border border-gray-200'
            } shadow-lg transition-colors`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        {/* Messages Area - Full Height */}
        <div className="flex-1 overflow-y-auto p-6 pb-32">
          {messages.length === 0 ? (
            // Empty State
            <div className="h-full flex flex-col items-center justify-center max-w-3xl mx-auto">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${
                theme === 'dark' ? 'bg-gradient-to-br from-purple-500/20 to-blue-500/20' : 'bg-gradient-to-br from-purple-100 to-blue-100'
              }`}>
                <svg className="w-10 h-10 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h2 className={`text-2xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                Hello there!
              </h2>
              <p className={`text-lg mb-8 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                How can I help you today?
              </p>

              {/* Suggested Prompts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                {suggestedPrompts.map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => handlePromptClick(prompt)}
                    className={`p-4 rounded-lg text-left text-sm transition-all ${
                      theme === 'dark'
                        ? 'bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-purple-500/50'
                        : 'bg-white hover:bg-gray-50 border border-gray-200 hover:border-purple-300'
                    }`}
                  >
                    <div className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {prompt}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            // Messages
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex items-start space-x-3 max-w-[80%] ${message.type === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      message.type === 'user'
                        ? 'bg-purple-500'
                        : theme === 'dark'
                          ? 'bg-gradient-to-br from-purple-500 to-blue-500'
                          : 'bg-gradient-to-br from-purple-400 to-blue-400'
                    }`}>
                      {message.type === 'user' ? (
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      )}
                    </div>

                    {/* Message Content */}
                    <div className="flex-1">
                      <div className={`rounded-2xl px-4 py-3 ${
                        message.type === 'user'
                          ? 'bg-purple-500 text-white'
                          : theme === 'dark'
                            ? 'bg-gray-800 text-white'
                            : 'bg-white text-gray-900 border border-gray-200'
                      }`}>
                        <p className="text-sm leading-relaxed">{message.content}</p>
                      </div>
                      <div className={`text-xs mt-1 ${message.type === 'user' ? 'text-right' : 'text-left'} ${
                        theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                      }`}>
                        {message.timestamp}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Sticky Overlay Input - Bottom */}
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
          <div className={`h-32 bg-gradient-to-t ${
            theme === 'dark' ? 'from-[#0a0a0f] to-transparent' : 'from-gray-50 to-transparent'
          }`}></div>

          <div className={`${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'} px-6 pb-6 pointer-events-auto`}>
            <div className="max-w-3xl mx-auto">
              <div className={`flex items-end space-x-3 p-3 rounded-2xl shadow-lg ${
                theme === 'dark' ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
              }`}>
                {/* Attachment Button */}
                <button className={`p-2 rounded-lg transition-colors ${
                  theme === 'dark' ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
                }`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>

                {/* Text Input */}
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Send a message..."
                  rows={1}
                  className={`flex-1 bg-transparent resize-none outline-none text-sm ${
                    theme === 'dark' ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'
                  } max-h-32`}
                />

                {/* Send Button */}
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim()}
                  className={`p-2 rounded-lg transition-all ${
                    inputValue.trim()
                      ? 'bg-purple-500 hover:bg-purple-600 text-white'
                      : theme === 'dark'
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>

              {/* Footer Info */}
              <div className={`text-center text-xs mt-2 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                HolmesGPT can make mistakes. Please verify critical information.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HolmesGPT;

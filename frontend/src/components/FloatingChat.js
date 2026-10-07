import React, { useState, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useTheme } from '../context/ThemeContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { sendAgentMessage, parseSSEEvents } from '../services/agentApi';

const FloatingChat = ({ isOpen, onClose }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const selectedCluster = useSelector((state) => state.cluster?.selectedCluster);

  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const messagesEndRef = useRef(null);

  const suggestedPrompts = [
    "Analyze recent pod failures",
    "Check service health",
    "Show latest alerts",
    "Debug network issues",
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || isStreaming) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: inputValue,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const aiMessageId = Date.now() + 1;
    const aiMessage = {
      id: aiMessageId,
      type: 'ai',
      content: '',
      toolCalls: [],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage, aiMessage]);
    const currentInput = inputValue;
    setInputValue('');
    setIsStreaming(true);

    try {
      const reader = await sendAgentMessage({
        message: currentInput,
        conversationId,
        modelProvider: 'anthropic',
        clusterId: selectedCluster?._id || '',
      });

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.type === 'token') {
            setMessages((prev) =>
              prev.map((m) => m.id === aiMessageId ? { ...m, content: m.content + event.content } : m)
            );
          } else if (event.type === 'tool_start') {
            setMessages((prev) =>
              prev.map((m) => m.id === aiMessageId
                ? { ...m, toolCalls: [...m.toolCalls, { tool: event.tool, status: 'running' }] }
                : m)
            );
          } else if (event.type === 'tool_end') {
            setMessages((prev) =>
              prev.map((m) => m.id === aiMessageId
                ? { ...m, toolCalls: m.toolCalls.map((tc) =>
                    tc.tool === event.tool && tc.status === 'running' ? { ...tc, status: 'done' } : tc
                  )}
                : m)
            );
          } else if (event.type === 'done') {
            setConversationId(event.conversationId);
          } else if (event.type === 'error') {
            setMessages((prev) =>
              prev.map((m) => m.id === aiMessageId ? { ...m, content: `Error: ${event.error}` } : m)
            );
          }
        }
      }
    } catch (err) {
      console.error('Agent error:', err);
      setMessages((prev) =>
        prev.map((m) => m.id === aiMessageId ? { ...m, content: `Error: ${err.message}` } : m)
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const handlePromptClick = (prompt) => {
    setInputValue(prompt);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity" onClick={onClose} />

      <div className={`fixed bottom-4 right-4 w-96 h-[600px] rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden ${
        isDark ? 'bg-[#13131f] border border-gray-800' : 'bg-white border border-gray-200'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h3 className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>HolmesGPT</h3>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Deep Agent</p>
            </div>
          </div>
          <button onClick={onClose} className={`p-1 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
                isDark ? 'bg-gradient-to-br from-purple-500/20 to-blue-500/20' : 'bg-gradient-to-br from-purple-100 to-blue-100'
              }`}>
                <svg className="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className={`text-lg font-bold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>Hello!</h3>
              <p className={`text-sm mb-4 text-center ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>How can I help you?</p>

              <div className="space-y-2 w-full">
                {suggestedPrompts.map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => handlePromptClick(prompt)}
                    className={`w-full p-3 rounded-lg text-left text-xs transition-all ${
                      isDark
                        ? 'bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-purple-500/50'
                        : 'bg-gray-50 hover:bg-gray-100 border border-gray-200 hover:border-purple-300'
                    }`}
                  >
                    <div className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{prompt}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex items-start space-x-2 max-w-[85%] ${message.type === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                      message.type === 'user' ? 'bg-purple-500' : 'bg-gradient-to-br from-purple-500 to-blue-500'
                    }`}>
                      {message.type === 'user' ? (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      ) : (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className={`rounded-xl px-3 py-2 ${
                        message.type === 'user'
                          ? 'bg-purple-500 text-white'
                          : isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'
                      }`}>
                        {message.type === 'ai' && message.toolCalls?.length > 0 && (
                          <div className="mb-2 space-y-1">
                            {message.toolCalls.map((tc, i) => (
                              <div key={i} className={`flex items-center text-[10px] px-2 py-1 rounded ${isDark ? 'bg-gray-900' : 'bg-gray-200'}`}>
                                {tc.status === 'running' ? (
                                  <span className="w-2 h-2 mr-1.5 rounded-full border border-purple-500 border-t-transparent animate-spin" />
                                ) : (
                                  <svg className="w-2 h-2 mr-1.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                                <span className={`font-mono ${isDark ? 'text-purple-300' : 'text-purple-600'}`}>{tc.tool}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {message.content ? (
                          <div className="prose prose-xs max-w-none dark:prose-invert text-xs leading-relaxed">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                          </div>
                        ) : isStreaming && messages[messages.length - 1]?.id === message.id ? (
                          <div className="flex items-center space-x-1">
                            <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        ) : null}
                      </div>
                      <div className={`text-[10px] mt-1 ${message.type === 'user' ? 'text-right' : 'text-left'} ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
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

        {/* Input Area */}
        <div className={`p-3 border-t ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className={`flex items-end space-x-2 p-2 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type a message..."
              rows={1}
              disabled={isStreaming}
              className={`flex-1 bg-transparent resize-none outline-none text-xs ${
                isDark ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'
              } max-h-24 disabled:opacity-50`}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isStreaming}
              className={`p-2 rounded-lg transition-all flex-shrink-0 ${
                inputValue.trim() && !isStreaming
                  ? 'bg-purple-500 hover:bg-purple-600 text-white'
                  : isDark ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
          <div className={`text-center text-[10px] mt-1 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
            Deep Agent — verify critical actions
          </div>
        </div>
      </div>
    </>
  );
};

export default FloatingChat;

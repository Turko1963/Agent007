const { useState, useRef, useEffect } = React;

function AgentGPTApp() {
    const [task, setTask] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [thinking, setThinking] = useState(false);
    const [messages, setMessages] = useState([]);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState('');
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const addMessage = (role, content) => {
        setMessages(prev => [...prev, { role, content, timestamp: new Date().toISOString() }]);
    };

    const callGPT = async (systemPrompt, userPrompt) => {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ]
            })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return data.choices[0].message.content;
    };

    const executeStep = async (step, context) => {
        addMessage('agent', `🤔 Thinking about how to execute: ${step}`);
        
        try {
            const execution = await callGPT(
                "You are an autonomous AI agent. Execute the given step and provide detailed results. If you need any user input or clarification, explicitly state 'NEED_INPUT: your question'. Always think step by step and explain your thought process.",
                `Current step to execute: ${step}\nContext: ${context}\nThink through this step carefully and explain your process.`
            );

            if (execution.includes('NEED_INPUT:')) {
                addMessage('agent', '❓ I need some information from you:');
                addMessage('agent', execution.split('NEED_INPUT:')[1].trim());
                setStatus('waiting_input');
                return { needsInput: true, question: execution.split('NEED_INPUT:')[1].trim() };
            }

            addMessage('agent', `✓ ${execution}`);
            return { needsInput: false, result: execution };
        } catch (err) {
            addMessage('error', `❌ Error executing step: ${err.message}`);
            throw err;
        }
    };

    const handleSubmit = async () => {
        if (thinking) return;
        setThinking(true);
        setStatus('working');
        setMessages([]);
        setError('');

        try {
            addMessage('agent', '🔍 Analyzing the task and creating a plan...');
            
            const taskAnalysis = await callGPT(
                "You are an autonomous task planning AI. Analyze the given task and break it down into clear, specific steps. Think carefully about dependencies and potential challenges.",
                `Task: ${task}\nCreate a detailed plan with numbered steps. Consider edge cases and potential challenges.`
            );

            addMessage('agent', '📋 Here\'s my plan:');
            addMessage('agent', taskAnalysis);

            const steps = taskAnalysis
                .split('\n')
                .filter(line => /^\d+\./.test(line))
                .map(line => line.replace(/^\d+\.\s*/, '').trim());

            let context = '';
            for (let i = 0; i < steps.length; i++) {
                addMessage('agent', `\n🔄 Starting step ${i + 1}/${steps.length}`);
                
                const result = await executeStep(steps[i], context);
                if (result.needsInput) {
                    setThinking(false);
                    return;
                }
                
                context += `\nStep ${i + 1} result: ${result.result}`;
            }

            addMessage('agent', '🎉 Task completed successfully!');
            setStatus('completed');

        } catch (err) {
            setError(err.message);
            addMessage('error', `❌ Error: ${err.message}`);
            setStatus('error');
        } finally {
            setThinking(false);
        }
    };

    const handleUserInput = async (event) => {
        if (event.key !== 'Enter' || !event.target.value.trim()) return;
        
        const userResponse = event.target.value;
        event.target.value = '';
        
        addMessage('user', userResponse);
        setStatus('working');
        setThinking(true);

        try {
            const continuation = await callGPT(
                "You are an autonomous AI agent. Continue the task execution with the provided user input.",
                `Previous context: ${messages.map(m => m.content).join('\n')}\nUser input: ${userResponse}\nContinue the task execution.`
            );

            addMessage('agent', continuation);
            
            if (!continuation.includes('NEED_INPUT:')) {
                handleSubmit();
            }
        } catch (err) {
            setError(err.message);
            setStatus('error');
        } finally {
            setThinking(false);
        }
    };

    return (
        <div className="min-h-screen py-8">
            <div className="container mx-auto px-4 max-w-3xl">
                <div className="space-y-6">
                    <h1 className="text-4xl font-bold text-center mb-8 green-text">AgentGPT</h1>
                    
                    <div>
                        <label className="block text-sm font-medium mb-2 text-gray-300">OpenAI API Key</label>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="Enter your API key"
                            className="w-full p-4 rounded-md chatgpt-input text-white placeholder-gray-500"
                        />
                    </div>
                    
                    <div className="relative">
                        <textarea
                            value={task}
                            onChange={(e) => setTask(e.target.value)}
                            disabled={thinking}
                            placeholder="Describe your task..."
                            className="w-full p-4 pr-20 rounded-lg chatgpt-input text-white placeholder-gray-500 h-32 resize-none"
                        />
                        <button 
                            onClick={handleSubmit}
                            disabled={thinking || !task || !apiKey}
                            className={`absolute right-3 bottom-3 p-2 px-4 rounded-md ${
                                thinking || !task || !apiKey 
                                    ? 'bg-gray-600 cursor-not-allowed' 
                                    : 'green-button hover:bg-green-700'
                            } text-white transition-colors duration-200`}
                        >
                            {thinking ? '...' : '▶'}
                        </button>
                    </div>

                    {messages.length > 0 && (
                        <div className="result-block rounded-lg p-6 space-y-4">
                            {messages.map((message, index) => (
                                <div key={index} className={`${
                                    message.role === 'error' ? 'text-red-400' :
                                    message.role === 'user' ? 'text-blue-400' : 'text-gray-300'
                                }`}>
                                    {message.content}
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                    )}

                    {status === 'waiting_input' && (
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Type your response and press Enter..."
                                className="w-full p-4 rounded-md chatgpt-input text-white placeholder-gray-500"
                                onKeyPress={handleUserInput}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

ReactDOM.render(<AgentGPTApp />, document.getElementById('root'));

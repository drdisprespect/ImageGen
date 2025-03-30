import React, { useState } from 'react';
import './ChatBot.css';
import chatIcon from './trump.png';

const ChatBot = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { sender: 'ai', text: 'Welcome to Imagine.AI! I’m your assistant for using the web app. Feel free to ask any questions or ask for help navigating our features.' }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);

    const toggleChat = () => {
        console.log('Toggling chatbox. Current state:', isOpen);
        setIsOpen(prev => !prev);
    };

    const sendMessage = async () => {
        if (!input.trim()) return;
        const currentInput = input;
        console.log('Sending message:', currentInput);

        const userMessage = { sender: 'user', text: currentInput };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);

        try {
            const response = await fetch('http://localhost:8080/api/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: currentInput }),
            });

            console.log('Fetch response status:', response.status);
            const data = await response.json();
            console.log('Response data:', data);
            const aiMessage = { sender: 'ai', text: data.response };
            setMessages(prev => [...prev, aiMessage]);
        } catch (err) {
            console.error('Error in sendMessage:', err);
            const errorMessage = {
                sender: 'ai',
                text: 'Sorry, there was an error processing your request.',
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div className="chatbot-container">
            {isOpen ? (
                <div className="chatbox">
                    <div className="chatbox-header">
                        <h4>AI Assistant by Gemini</h4>
                        <button onClick={toggleChat} className="close-button">&times;</button>
                    </div>
                    <div className="chatbox-body">
                        {messages.map((msg, index) => (
                            <div key={index} className={`message ${msg.sender}`}>
                                {msg.text}
                            </div>
                        ))}
                        {loading && <div className="message ai">Typing...</div>}
                    </div>
                    <div className="chatbox-footer">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Type a message..."
                        />
                        <button onClick={sendMessage} disabled={loading} className="send-button">
                            Send
                        </button>
                    </div>
                </div>
            ) : (
                <button className="chatbot-toggle-button" onClick={toggleChat}>
                    <img src={chatIcon} alt="Chat Icon" />
                </button>
            )}
        </div>
    );
};

export default ChatBot;

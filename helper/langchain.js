const axios = require('axios');

class LangChain {
    constructor(userId) {
        this.userId = userId;
        this.conversationHistory = [];
    }

    async addMessage(content) {
        this.conversationHistory.push({ role: 'user', content: content });
    }

    async getResponse() {
        // Make a call to OpenAI API or LangChain API
        try {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-3.5-turbo',
                    messages: this.conversationHistory,
                    max_tokens: 150,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                        'Content-Type': 'application/json',
                    }
                }
            );

            const responseContent = response.data.choices[0].message.content.trim();
            this.conversationHistory.push({ role: 'assistant', content: responseContent });
            return responseContent;
        } catch (error) {
            console.error('Error getting response from AI:', error.response ? error.response.data : error.message);
            throw new Error('Something went wrong while getting the response from the AI.');
        }
    }
}

module.exports = LangChain;
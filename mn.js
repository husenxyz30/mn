const fs = require('fs');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const { DateTime } = require('luxon');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

class MagicNewtonAPIClient {
    constructor() {
        this.headers = {
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Content-Type': 'application/json',
            'Referer': 'https://www.magicnewton.com/portal/rewards',
            'Sec-Ch-Ua': '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        };
        this.proxies = [];
        this.loadProxies();
    }

    loadProxies() {
        try {
            this.proxies = fs.readFileSync('proxy.txt', 'utf8')
                .replace(/\r/g, '')
                .split('\n')
                .filter(Boolean);

            // Log loaded proxies for debugging
            this.log(`Loaded proxies: ${this.proxies.join(', ')}`, 'info');
        } catch (error) {
            this.log('Error loading proxies: ' + error.message, 'error');
            this.proxies = [];
        }
    }

    getAxiosConfig(token, proxyIndex, useProxy = true) {
        const config = {
            headers: { ...this.headers }
        };

        if (token) {
            config.headers.Cookie = `__Secure-next-auth.session-token=${token}`;
        }

        if (useProxy && this.proxies[proxyIndex]) {
            const proxy = this.proxies[proxyIndex];
            if (proxy.startsWith('socks5://')) {
                config.httpsAgent = new SocksProxyAgent(proxy);
            } else {
                config.httpsAgent = new HttpsProxyAgent(proxy);
            }
        }

        return config;
    }

    log(msg, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        switch(type) {
            case 'success':
                console.log(`[${timestamp}] [✓] ${msg}`.green);
                break;
            case 'custom':
                console.log(`[${timestamp}] [*] ${msg}`.magenta);
                break;        
            case 'error':
                console.log(`[${timestamp}] [✗] ${msg}`.red);
                break;
            case 'warning':
                console.log(`[${timestamp}] [!] ${msg}`.yellow);
                break;
            default:
                console.log(`[${timestamp}] [ℹ] ${msg}`.blue);
        }
    }

    async countdown(seconds) {
        for (let i = seconds; i > 0; i--) {
            const timestamp = new Date().toLocaleTimeString();
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(`[${timestamp}] [*] Waiting ${i} seconds to continue the loop...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        readline.cursorTo(process.stdout, 0);
        readline.clearLine(process.stdout, 0);
    }

    async checkProxyIP(proxy) {
        if (!proxy) {
            // If no proxy is provided, get the public IP address directly
            try {
                const response = await axios.get('https://api.ipify.org?format=json', {
                    timeout: 10000
                });
                return response.data.ip; // Return the public IP address
            } catch (error) {
                this.log(`Error checking public IP: ${error.message}`, 'error');
                return 'Error'; // Return an error message if the request fails
            }
        }

        try {
            const proxyAgent = proxy.startsWith('socks5://') ? new SocksProxyAgent(proxy) : new HttpsProxyAgent(proxy);
            const response = await axios.get('https://api.ipify.org?format=json', {
                httpsAgent: proxyAgent,
                timeout: 10000
            });
            
            if (response.status === 200) {
                return response.data.ip;
            } else {
                return 'Unknown';
            }
        } catch (error) {
            this.log(`Error checking proxy IP: ${error.message}`, 'error'); // Improved error logging
            return 'Error';
        }
    }

    async getUserData(token, proxyIndex, useProxy = true) {
        const url = 'https://www.magicnewton.com/portal/api/user';
        try {
            const response = await axios.get(url, this.getAxiosConfig(token, proxyIndex, useProxy));
            if (response.status === 200 && response.data.data) {
                return { success: true, data: response.data.data };
            }
            return { success: false, error: 'Invalid response format' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getQuests(token, proxyIndex, useProxy = true) {
        const url = 'https://www.magicnewton.com/portal/api/quests';
        try {
            const response = await axios.get(url, this.getAxiosConfig(token, proxyIndex, useProxy));
            if (response.status === 200 && response.data.data) {
                return { success: true, data: response.data.data };
            }
            return { success: false, error: 'Invalid response format' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getDailyDiceRollId(token, proxyIndex) {
        try {
            const questsResult = await this.getQuests(token, proxyIndex);
            if (!questsResult.success) {
                this.log('Failed to fetch quests', 'error');
                return null;
            }

            const diceRollQuest = questsResult.data.find(quest => quest.title === 'Daily Dice Roll');
            if (!diceRollQuest) {
                this.log('Daily Dice Roll quest not found', 'error');
                return null;
            }

            return diceRollQuest.id;
        } catch (error) {
            this.log(`Error getting Daily Dice Roll ID: ${error.message}`, 'error');
            return null;
        }
    }

    async getUserQuests(token, proxyIndex) {
        const url = 'https://www.magicnewton.com/portal/api/userQuests';
        try {
            const response = await axios.get(url, this.getAxiosConfig(token, proxyIndex));
            if (response.status === 200 && response.data.data) {
                return { success: true, data: response.data.data };
            }
            return { success: false, error: 'Invalid response format' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async checkDiceRollAvailability(token, proxyIndex) {
        try {
            const diceRollId = await this.getDailyDiceRollId(token, proxyIndex);
            if (!diceRollId) {
                return false;
            }

            const userQuestsResult = await this.getUserQuests(token, proxyIndex);
            if (!userQuestsResult.success) {
                this.log('Failed to fetch user quests', 'error');
                return false;
            }

            const diceRollQuest = userQuestsResult.data.find(
                quest => quest.questId === diceRollId
            );

            if (!diceRollQuest) {
                return true;
            }

            const lastUpdateTime = DateTime.fromISO(diceRollQuest.updatedAt);
            const currentTime = DateTime.now();
            const hoursDiff = currentTime.diff(lastUpdateTime, 'hours').hours;

            if (hoursDiff < 24) {
                const remainingHours = Math.ceil(24 - hoursDiff);
                this.log(`Not yet time to roll the dice, remaining time ${remainingHours} hours`, 'warning');
                return false;
            }

            return true;
        } catch (error) {
            this.log(`Error checking dice roll availability: ${error.message}`, 'error');
            return false;
        }
    }

    async performDiceRoll(token, diceRollId, proxyIndex) {
        const url = 'https://www.magicnewton.com/portal/api/userQuests';
        const config = this.getAxiosConfig(token, proxyIndex);
        const payload = {
            questId: diceRollId,
            metadata: {
                action: "ROLL"
            }
        };
    
        try {
            const userQuestsResult = await this.getUserQuests(token, proxyIndex);
            if (userQuestsResult.success) {
                const completedQuests = userQuestsResult.data.filter(
                    quest => quest.questId === diceRollId && quest.status === 'COMPLETED'
                );
    
                if (completedQuests.length > 0) {
                    const mostRecentQuest = completedQuests.sort((a, b) => 
                        DateTime.fromISO(b.updatedAt).toMillis() - DateTime.fromISO(a.updatedAt).toMillis()
                    )[0];
    
                    const lastUpdateTime = DateTime.fromISO(mostRecentQuest.updatedAt).setZone('local');
                    const currentTime = DateTime.now().setZone('local');
                    const hoursDiff = currentTime.diff(lastUpdateTime, 'hours').hours;
    
                    if (hoursDiff >= 24) {
                        this.log(`It has been more than 24 hours since the last roll, proceeding to roll again...`, 'info');
                    } else {
                        const nextRollTime = lastUpdateTime.plus({ hours: 24 });
                        this.log(`The quest has been completed before, credits received: ${mostRecentQuest.credits}`, 'warning');
                        if (mostRecentQuest._diceRolls) {
                            this.log(`Previous rolls: [${mostRecentQuest._diceRolls.join(', ')}]`, 'custom');
                        }
                        this.log(`Next roll time: ${nextRollTime.toFormat('dd/MM/yyyy HH:mm:ss')}`, 'custom');
                        return true;
                    }
                }
            }
    
            let isCompleted = false;
            let totalCredits = 0;
            let allRolls = [];
    
            while (!isCompleted) {
                const response = await axios.post(url, payload, config);
                
                if (response.status === 200 && response.data.data) {
                    const { status, credits, _diceRolls, updatedAt } = response.data.data;
                    
                    if (_diceRolls) {
                        allRolls = allRolls.concat(_diceRolls);
                        this.log(`Rolls: [${_diceRolls.join(', ')}]`, 'custom');
                    }
    
                    if (credits) {
                        totalCredits += credits;
                    }
    
                    if (status === 'COMPLETED') {
                        isCompleted = true;
                        const serverTime = DateTime.fromISO(updatedAt);
                        const localNextRollTime = serverTime.plus({ hours: 24 }).setZone('local');
                        
                        this.log(`Dice roll completed, total received ${totalCredits} credits`, 'success');
                        this.log(`All rolls: [${allRolls.join(', ')}]`, 'custom');
                        this.log(`Next roll time: ${localNextRollTime.toFormat('dd/MM/yyyy HH:mm:ss')}`, 'custom');
                    } else if (status === 'PENDING') {
                        this.log('Continuing to roll...', 'info');
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } else {
                    this.log('Failed to perform dice roll', 'error');
                    return false;
                }
            }
            
            return true;
        } catch (error) {
            if (error.response?.status === 400 && error.response?.data?.message === 'Quest already completed') {
                const userQuestsResult = await this.getUserQuests(token, proxyIndex);
                if (userQuestsResult.success) {
                    const completedQuests = userQuestsResult.data.filter(
                        quest => quest.questId === diceRollId && quest.status === 'COMPLETED'
                    );
    
                    if (completedQuests.length > 0) {
                        const mostRecentQuest = completedQuests.sort((a, b) => 
                            DateTime.fromISO(b.updatedAt).toMillis() - DateTime.fromISO(a.updatedAt).toMillis()
                        )[0];
    
                        const lastUpdateTime = DateTime.fromISO(mostRecentQuest.updatedAt).setZone('local');
                        const currentTime = DateTime.now().setZone('local');
                        const hoursDiff = currentTime.diff(lastUpdateTime, 'hours').hours;
    
                        if (hoursDiff >= 24) {
                            this.log(`It has been more than 24 hours since the last roll, trying to roll again...`, 'info');
                            return await this.performDiceRoll(token, diceRollId, proxyIndex);
                        } else {
                            const nextRollTime = lastUpdateTime.plus({ hours: 24 });
                            this.log(`Quest has been completed before, credits received: ${mostRecentQuest.credits}`, 'warning');
                            if (mostRecentQuest._diceRolls) {
                                this.log(`Previous rolls: [${mostRecentQuest._diceRolls.join(', ')}]`, 'custom');
                            }
                            this.log(`Next roll time: ${nextRollTime.toFormat('dd/MM/yyyy HH:mm:ss')}`, 'custom');
                            return true;
                        }
                    }
                }
            }
            
            this.log(`Error performing dice roll: ${error.message}`, 'error');
            return false;
        }
    }

    async checkAndPerformDiceRoll(token, diceRollId, proxyIndex) {
        try {
            const userQuestsResult = await this.getUserQuests(token, proxyIndex);
            if (!userQuestsResult.success) {
                this.log('Failed to fetch user quests', 'error');
                return false;
            }

            const diceRollQuest = userQuestsResult.data.find(
                quest => quest.questId === diceRollId
            );

            let shouldRoll = false;

            if (!diceRollQuest) {
                shouldRoll = true;
            } else {
                const lastUpdateTime = DateTime.fromISO(diceRollQuest.updatedAt).setZone('local');
                const currentTime = DateTime.now().setZone('local');
                const hoursDiff = currentTime.diff(lastUpdateTime, 'hours').hours;

                if (hoursDiff >= 24) {
                    shouldRoll = true;
                } else {
                    const remainingHours = Math.ceil(24 - hoursDiff);
                    const nextRollTime = lastUpdateTime.plus({ hours: 24 });
                    this.log(`Not yet time to roll the dice, remaining time ${remainingHours} hours`, 'warning');
                    this.log(`Next roll time: ${nextRollTime.toFormat('dd/MM/yyyy HH:mm:ss')}`, 'custom');
                }
            }

            if (shouldRoll) {
                return await this.performDiceRoll(token, diceRollId, proxyIndex);
            }

            return false;
        } catch (error) {
            this.log(`Error checking and performing dice roll: ${error.message}`, 'error');
            return false;
        }
    }

    async checkAndPerformSocialQuests(token, proxyIndex) {
        try {
            const questsResult = await this.getQuests(token, proxyIndex);
            if (!questsResult.success) {
                this.log('Failed to fetch quests', 'error');
                return;
            }

            const userQuestsResult = await this.getUserQuests(token, proxyIndex);
            if (!userQuestsResult.success) {
                this.log('Failed to fetch user quests', 'error');
                return;
            }

            const completedQuestIds = new Set(
                userQuestsResult.data.map(quest => quest.questId)
            );

            const socialQuests = questsResult.data.filter(quest => 
                quest.title.startsWith('Follow ') && 
                quest.title !== 'Follow Discord Server'
            );

            for (const quest of socialQuests) {
                if (!completedQuestIds.has(quest.id)) {
                    await this.performSocialQuest(token, quest.id, quest.title, proxyIndex);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        } catch (error) {
            this.log(`Error processing social quests: ${error.message}`, 'error');
        }
    }

    async performSocialQuest(token, questId, platform, proxyIndex) {
        const url = 'https://www.magicnewton.com/portal/api/userQuests';
        const config = this.getAxiosConfig(token, proxyIndex);
        const payload = {
            questId: questId,
            metadata: {}
        };

        try {
            const response = await axios.post(url, payload, config);
            if (response.status === 200 && response.data.data) {
                const { credits } = response.data.data;
                this.log(`Successfully completed the ${platform} task, received ${credits} Credits`, 'success');
                return true;
            }
            return false;
        } catch (error) {
            if (error.response?.status === 400) {
                this.log(`The ${platform} task has been completed before`, 'warning');
                return true;
            }
            this.log(`Error performing ${platform} quest: ${error.message}`, 'error');
            return false;
        }
    }

    async getNextRollTime(token, diceRollId, proxyIndex) {
        try {
            const userQuestsResult = await this.getUserQuests(token, proxyIndex);
            if (!userQuestsResult.success) {
                return null;
            }
    
            const completedQuests = userQuestsResult.data.filter(
                quest => quest.questId === diceRollId && quest.status === 'COMPLETED'
            );
    
            if (completedQuests.length === 0) {
                return DateTime.now();
            }
    
            const latestQuest = completedQuests.reduce((latest, current) => {
                const currentTime = DateTime.fromISO(current.updatedAt);
                const latestTime = DateTime.fromISO(latest.updatedAt);
                return currentTime > latestTime ? current : latest;
            });
    
            const lastUpdateTime = DateTime.fromISO(latestQuest.updatedAt).setZone('local');
            return lastUpdateTime.plus({ hours: 24 });
        } catch (error) {
            this.log(`Error getting next roll time: ${error.message}`, 'error');
            return null;
        }
    }

    calculateWaitTime(accountResults) {
        const validResults = accountResults.filter(result => 
            result.success && result.nextRollTime !== null
        );
        
        if (validResults.length === 0) {
            return 24 * 60 * 60;
        }
    
        const now = DateTime.now();
        
        const latestResult = validResults.reduce((latest, current) => {
            return current.nextRollTime > latest.nextRollTime ? current : latest;
        });
    
        let waitSeconds = Math.ceil(latestResult.nextRollTime.diff(now, 'seconds').seconds);
        
        waitSeconds += 5 * 60;
        
        if (waitSeconds < 300) {
            return 24 * 60 * 60;
        }
    
        this.log(`The account with the longest wait time: ${latestResult.email}`, 'info');
        return waitSeconds;
    }

    async processAccount(token, proxyIndex) {
        try {
            const proxy = this.proxies[proxyIndex] || ''; // Get the proxy or set to empty string
            const proxyIP = await this.checkProxyIP(proxy); // Check proxy IP or get public IP
            this.log(`Processing account with IP: ${proxyIP}`, 'custom');
    
            const result = await this.getUserData(token, proxyIndex);
            if (result.success) {
                const { email, refCode } = result.data;
                this.log(`Account ${email.yellow} | refcode: ${refCode.green}`, 'custom');
                
                await this.checkAndPerformSocialQuests(token, proxyIndex);
                
                const diceRollId = await this.getDailyDiceRollId(token, proxyIndex);
                if (diceRollId) {
                    const rollPerformed = await this.checkAndPerformDiceRoll(token, diceRollId, proxyIndex);
                    const nextRollTime = await this.getNextRollTime(token, diceRollId, proxyIndex);
                    return {
                        success: true,
                        nextRollTime: nextRollTime,
                        email: email
                    };
                }
            } else {
                this.log(`Failed to fetch data: ${result.error}`, 'error');
            }
            return { success: false };
        } catch (error) {
            this.log(`Error processing account: ${error.message}`, 'error');
            return { success: false };
        }
    }

    async main() {
        try {
            this.log(`Read ${this.proxies.length} proxies`, 'info');
    
            const tokens = fs.readFileSync('data.txt', 'utf8')
                .replace(/\r/g, '')
                .split('\n')
                .filter(Boolean);
    
            this.log(`Read ${tokens.length} accounts`, 'info');
    
            while (true) {
                const accountResults = [];
                
                for (let i = 0; i < tokens.length; i++) {
                    const token = tokens[i].trim();
                    const proxyIP = await this.checkProxyIP(this.proxies[i] || '');
                    console.log(`========== Processing account ${i + 1} | ip: ${proxyIP} ==========`);
                    
                    const result = await this.processAccount(token, i);
                    if (result.success) {
                        accountResults.push(result);
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
    
                const waitSeconds = this.calculateWaitTime(accountResults);
                const waitTimeFormatted = DateTime.now().plus({ seconds: waitSeconds })
                    .toFormat('dd/MM/yyyy HH:mm:ss');
                
                this.log(`Start time for the next run: ${waitTimeFormatted}`, 'custom');
                await this.countdown(waitSeconds);
            }
        } catch (error) {
            this.log(`Fatal error: ${error.message}`, 'error');
            process.exit(1);
        }
    }
}

const client = new MagicNewtonAPIClient();
client.main().catch(err => {
    client.log(`Fatal error in main execution: ${err.message}`, 'error');
    process.exit(1);
});
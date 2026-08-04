const path = require('path');
const crypto = require('crypto');
const { is } = require('@electron-toolkit/utils');

const isChitkara = process.env.APP_IS_CHITKARA == 'true';

const config = ((env) => {
    switch (env) {
        case 'production': {
            if (isChitkara) {
                return {
                    'URL': 'https://exam.testpad.chitkara.edu.in',
                    'QUIZ_SERVER': 'https://infra.assess.testpad.chitkara.edu.in',
                    'LOGIN_SERVER': 'https://login.testpad.chitkara.edu.in',
                    'allowedUrl': [
                        'https://infra.assess.testpad.chitkara.edu.in', 'https://infra.assess.testpad.chitkarauniversity.edu.in',
                        'https://assess.testpad.chitkara.edu.in', 'https://exam.testpad.chitkara.edu.in',
                        'https://assess.testpad.chitkarauniversity.edu.in', 'https://exam.testpad.chitkarauniversity.edu.in',
                    ],
                    'QUIZ_STATIC': 'https://static.assess.testpad.chitkara.edu.in',
                    'cookieConfig': {
                        'domain': '.testpad.chitkara.edu.in',
                        'httpOnly': true, 'path': '/', 'sameSite': 'lax',
                        'url': 'https://assess.testpad.chitkara.edu.in',
                    },
                };
            }
            return {
                'URL': 'https://tests.codequotient.com',
                'QUIZ_SERVER': 'https://codequotient.com',
                'LOGIN_SERVER': 'https://login.codequotient.com',
                'allowedUrl': ['https://tests.codequotient.com', 'https://codequotient.com'],
                'QUIZ_STATIC': 'https://static.test.codequotient.com',
                'cookieConfig': {
                    'domain': '.codequotient.com',
                    'httpOnly': true, 'path': '/', 'sameSite': 'lax',
                    'url': 'https://codequotient.com',
                },
            };
        }
        case 'testing': {
            if (isChitkara) {
                return {
                    'URL': 'https://app.test.chitkara.cqtestga.com',
                    'QUIZ_SERVER': 'https://test.chitkara.cqtestga.com',
                    'LOGIN_SERVER': 'https://login.chitkara.cqtestga.com',
                    'QUIZ_STATIC': 'https://static.chitkara.cqtestga.com',
                    'allowedUrl': [
                        'https://test.chitkara.cqtestga.com',
                        'https://app.test.chitkara.cqtestga.com',
                        'https://exam.test.chitkara.cqtestga.com',
                    ],
                };
            }
            return {
                'URL': 'https://tests.cqtestga.com',
                'QUIZ_SERVER': 'https://cqtestga.com',
                'LOGIN_SERVER': 'https://login.cqtestga.com',
                'allowedUrl': ['https://tests.cqtestga.com', 'https://cqtestga.com'],
                'QUIZ_STATIC': 'https://static.cqtestga.com',
                'cookieConfig': {
                    'domain': '.cqtestga.com',
                    'httpOnly': true, 'path': '/', 'sameSite': 'lax',
                    'url': 'https://cqtestga.com',
                },
            };
        }
        default: return {
            'URL': 'http://localhost:3000',
            'QUIZ_SERVER': 'http://localhost:3003',
            'LOGIN_SERVER': 'http://localhost:5005',
            'QUIZ_STATIC': 'http://localhost:3003/static',
            'allowedUrl': ['http://localhost:3000', 'http://localhost:3003', 'http://localhost:5005'],
        };
    }
})(process.env.VITE_USER_NODE_ENV);


// --- Paste keys from createEncryptionKey.js output ---

const E_PUB_B64 = "qIsqJCCXuXzCYXbmeTzctAPBAhaxh8h00d+4JF2xc1s=";
const E_PRIV_B64 = "WO+bRvCO/HJkPbkieIcKOHzaQdYIgK9oifUbYrfmNXE=";
const S_PUB_B64 = "hTasLpcY5XDu7gVHvq4aJpcB5Gck4NATf2EywF4KJyQ=";

function b64ToU8(s) { return Buffer.from(s, 'base64'); }

const keys = {};

function rawToPrivKey(raw) {
    return crypto.createPrivateKey({
        key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), raw]),
        format: 'der', type: 'pkcs8',
    });
}

function rawToPubKey(raw) {
    return crypto.createPublicKey({
        key: Buffer.concat([Buffer.from('302a300506032b656e032100', 'hex'), raw]),
        format: 'der', type: 'spki',
    });
}

// Client side: info = clientPub || serverPub, rx/tx in natural order
function deriveClientSessionKeys(clientPubB64, clientPrivB64, serverPubB64) {
    const clientPub = b64ToU8(clientPubB64);
    const serverPub = b64ToU8(serverPubB64);

    const sharedSecret = crypto.diffieHellman({
        privateKey: rawToPrivKey(b64ToU8(clientPrivB64)),
        publicKey: rawToPubKey(serverPub),
    });

    const info = Buffer.concat([clientPub, serverPub]);
    return {
        sharedRx: Buffer.from(crypto.hkdfSync('sha256', sharedSecret, Buffer.alloc(0), Buffer.concat([info, Buffer.from('rx')]), 32)),
        sharedTx: Buffer.from(crypto.hkdfSync('sha256', sharedSecret, Buffer.alloc(0), Buffer.concat([info, Buffer.from('tx')]), 32)),
    };
}

async function initSodium() {
    const resKey = deriveClientSessionKeys(E_PUB_B64, E_PRIV_B64, S_PUB_B64);
    Object.assign(keys, resKey);

    return resKey;
}

const resourcePath = is.dev ? path.join(__dirname, '../../') : process.resourcesPath;
const pathForExtraResources = path.join(resourcePath, './extra');
config.extraResourcesPath = pathForExtraResources;

console.log('EXTRA RESOURCE PATH: ', config.extraResourcesPath);

const retryPagePath = 'public/html/retryPage.html';

module.exports = Object.freeze({
    ...config,
    keys,
    isChitkara,
    retryPagePath,
    initSodium,
    NODE_ENV: process.env.VITE_USER_NODE_ENV,
});

//--FILE-SEPARATOR--

const { screen, session, desktopCapturer, app } = require('electron');
const zod = require('zod');
const fs = require('fs');
const path = require('path');
const config = require('../config/config')
const logger = require('electron-log');
const crypto = require('node:crypto');

/**
 * 
 * @param {string | null} link 
 * @returns 
 */
const parseLink = (link) => {
    const allowedUrl = config.allowedUrl;

    link = link?.trim()
    if (!link) {
        return null;
    }
    if (link.indexOf('/test/') === -1) {
        return null;
    }


    let linkParts = link.split('://');
    if (linkParts.length < 2) {
        linkParts = link.split('//');
    }
    if (linkParts.length < 2) {
        // no protocol
        if (link.startsWith('localhost') || link.startsWith('127.0.0.1')) {
            link = 'http:/' + link
        } else {
            link = 'https:/' + link
        }
    } else {
        link = linkParts.join('://');
    }
    for (let singleAllowedLink of allowedUrl) {
        if (link.startsWith(singleAllowedLink)) {
            if (link.includes('/invite/') && link.startsWith('https://tests.')) {
                const token = link.split('/invite/')[1];
                link = link.replace('tests.', '');
                link = link.split('/test/')[0] + `/test/invite/${token}`
            }
            if (link.includes('/invite/') && link.startsWith('https://exam.')) {
                const token = link.split('/invite/')[1];
                link = link.replace('exam.test.', 'test.');
                link = link.replace('exam.', 'assess.');
                link = link.split('/test/')[0] + `/test/invite${token}`;
            }
            return link;
        }
    }
    return null;
}

/**
 * @param {string} folderPath
 */
const ensureDir = (folderPath) => {
    console.log(folderPath);
    if (fs.existsSync(folderPath)) {
        return;
    }
    fs.mkdirSync(folderPath);
}

/**
 * 
 * @param {{ quizId: string, userId: string } | undefined} config 
 */
const getPathForRecording = (config) => {
    const basePath = path.join(app.getPath('appData'), 'recording');
    ensureDir(basePath);
    if (config) {
        const finalPath = path.join(basePath, `recording-${config.quizId}-${config.userId}`);
        ensureDir(finalPath);
        return finalPath;
    }
    return basePath;
}
/**
 * @param {Record<string, unknown>} payload
 * @param {string} [keyToUse]
*/
function encodePayload(payload, keyToUse) {
    if (!keyToUse) {
        keyToUse = config.keys.sharedTx;
    }

    let key;
    if (Buffer.isBuffer(keyToUse)) {
        key = keyToUse;
    } else if (keyToUse instanceof Uint8Array) {
        key = Buffer.from(keyToUse);
    } else {
        key = Buffer.from(keyToUse, 'base64');
    }

    const payloadString = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const adStr = `${crypto.randomUUID()}|${timestamp}`;

    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(adStr, 'utf8'));

    const ciphertext = Buffer.concat([
        cipher.update(Buffer.from(payloadString, 'utf8')),
        cipher.final()
    ]);
    const tag = cipher.getAuthTag();

    const envelope = {
        version: '1.0',
        sender: 'electron',
        timestamp,
        nonce: nonce.toString('base64'),
        ad: Buffer.from(adStr, 'utf8').toString('base64'),
        ciphertext: Buffer.concat([ciphertext, tag]).toString('base64'),
    };

    return {
        payload: envelope,
        headers: {
            'ENCRYPTION-VERSION': envelope.version,
        }
    };
}

function decodePayload(payload, keyToUse) {
    if (!keyToUse) {
        keyToUse = config.keys.sharedRx;
    }

    let key;
    if (Buffer.isBuffer(keyToUse)) {
        key = keyToUse;
    } else if (keyToUse instanceof Uint8Array) {
        key = Buffer.from(keyToUse);
    } else {
        key = Buffer.from(keyToUse, 'base64');
    }

    const nonce = Buffer.from(payload.nonce, 'base64');
    const bundle = Buffer.from(payload.ciphertext, 'base64');

    // tag is last 16 bytes, ciphertext is the rest
    const tag = bundle.subarray(bundle.length - 16);
    const ciphertext = bundle.subarray(0, bundle.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);

    if (payload.ad) {
        decipher.setAAD(Buffer.from(payload.ad, 'base64'));
    }

    let ptBuf;
    try {
        ptBuf = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch (err) {
        console.error('decrypt failed:', err?.message);
        return null;
    }

    const plaintext = ptBuf.toString('utf8');
    try {
        return JSON.parse(plaintext);
    } catch {
        return null;
    }
}

module.exports = {
    parseLink,
    ensureDir,
    decodePayload,
    encodePayload,
    getPathForRecording,
}

//--FILE-SEPARATOR--

const constant = require('../config/stateChangeScript');

const utils = require('./utils')

module.exports = {
    constant,
    utils,
}

//--FILE-SEPARATOR--

// @ts-check

const { Server, Socket } = require("node:net");
const { spawn } = require("node:child_process");

/**
 * @typedef {Object} PipeServerOptions
 * @property {string} exePath
 * @property {string[]} [args]
 */

class PipeServerError extends Error {
	/**
	 * @param {string} message
	 * @param {number} code
	 * @param {Error | null} [cause]
	 */
	/**
	 * @param {string} message
	 * @param {number} code
	 * @param {Error | null} [cause]
	 * @param {DiagData | null} [diag]
	 */
	constructor(message, code, cause = null, diag = null) {
		super(message);
		this.name = "PipeServerError";
		this.code = code;
		this.cause = cause;
		/** @type {DiagData | null} */
		this.diag = diag;
	}

	toJSON() {
		return {
			name: this.name,
			message: this.message,
			code: this.code,
			stack: this.stack,
			cause: PipeServerError.normalizeError(this.cause),
			diag: this.diag,
		};
	}

	/** @param {unknown} error */
	static normalizeError(error) {
		if (error === null || error === undefined) {
			return null;
		}
		const normalizedError = error instanceof Error ? error : new Error(String(error));
		return {
			name: normalizedError.name,
			message: normalizedError.message
		};
	}

};

/** @typedef {{ hwnd: number, affinity: number, title: string, className: string }} WindowRecord */
/** @typedef {{ parseError: string | null, rawSize: number, payloadSize: number, exitCode: number, targetPid: number, ssn: number, prologueBytes: string, hwnd: number, syscallStatus: number, syscallStatusDesc: string, affinity: number, win32uSigned: number, windowCount: number, osBuild: number, windows: WindowRecord[] }} DiagData */
/** @typedef {({ detection: { diag: DiagData } } | { pipePath: string; hwnd: string; error: ReturnType<PipeServerError["toJSON"]> })} CheckResult */

class PipeServer {
	/** @type {string} */
	#pipeName;

	/** @type {Server | null} */
	#server = null;

	/** @type {string} */
	#exePath;

	/** @type {string[]} */
	#args;

	/** @type {Buffer[]} */
	#chunks = [];

	/** @type {Promise<Server> | null} */
	#opening = null;

	static #DIAG_VERSION = 1;
	static #DIAG_MIN_SIZE = 8;   // version + payloadSize
	static #WINDOW_RECORD_SIZE = 104; // hwnd(4) + affinity(4) + title(64) + className(32)

	/** @param {PipeServerOptions} options */
	constructor(options) {
		this.#pipeName = `\\\\.\\pipe\\affinity_check_${process.pid}`;
		this.#exePath = options.exePath;
		this.#args = options.args ?? [];
	}

	/** @returns {Promise<Server>} */
	#open() {
		if (this.#server?.listening) {
			return Promise.resolve(this.#server);
		}
		if (this.#opening) return this.#opening;
		this.#opening = new Promise((resolve, reject) => {
			const server = new Server();
			this.#server = server;
			this.#server.on("connection", socket => this.#onConnection(socket));
			this.#server.once("error", reject);
			this.#server.listen(this.#pipeName, () => resolve(server));
		}).finally(() => { this.#opening = null; });
		return this.#opening;
	}

	/** @returns {Promise<Error | void>} */
	close() {
		const server = this.#server;
		this.#server = null;
		if (!server) return Promise.resolve();
		return new Promise(resolve => server.close(resolve));
	}

	/**
	 * @param {import("electron").BrowserWindow} browserWindow 
	 * @returns {Promise<CheckResult>}
	 * @description Must never throw, should always resolve with a CheckResult object.
	*/
	async run(browserWindow) {
		this.#chunks = [];
		const server = await this.#open();
		/** @type {Promise<CheckResult>} */
		const promise = new Promise((resolve, reject) => {
			server.once("error", error => {
				reject(new PipeServerError("Failed to start pipe server", -1, error));
			});
			this.#onListening(resolve, reject);
		});
		try {
			return await promise;
		} catch (ex) {
			let error;
			if (ex instanceof PipeServerError) {
				error = ex;
			} else {
				const cause = ex instanceof Error ? ex : new Error(String(ex));
				error = new PipeServerError("Unexpected error while running pipe server", -1, cause);
			}
			return {
				pipePath: this.#pipeName,
				hwnd: PipeServer.littleEndian(browserWindow),
				error: error.toJSON()
			};
		} finally {
			await this.close();
		}
	}

	/** @param {import("electron").BrowserWindow} browserWindow */
	static littleEndian(browserWindow) {
		const hwndBuf = browserWindow.getNativeWindowHandle();
		if (process.arch === "x64" || process.arch === "arm64") {
			return hwndBuf.readBigUInt64LE(0).toString();
		} else {
			return BigInt(hwndBuf.readUInt32LE(0)).toString();
		}
	}

	/**
	 * @param {Socket} socket
	 */
	#onConnection(socket) {
		socket.on("data", (data) => {
			this.#chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
		});
		socket.on("end", () => {
			socket.destroy();
		});
	}

	/**
	 * @param {(result: CheckResult) => void} resolve
	 * @param {(err: Error) => void} reject
	 */
	#onListening(resolve, reject) {
		const child = spawn(this.#exePath, this.#args, { stdio: "ignore" });
		child.on("error", (err) => this.#onChildError(err, reject));
		child.on("close", (code) => this.#onChildClose(code, resolve, reject));
	}

	/**
	 * @param {Error} error
	 * @param {(err: PipeServerError) => void} reject
	 */
	#onChildError(error, reject) {
		reject(new PipeServerError("Failed to start child process", -1, error));
	}

	/**
	 * @param {number | null} code
	 * @param {(result: CheckResult) => void} resolve
	 * @param {(err: Error) => void} reject
	 */
	#onChildClose(code, resolve, reject) {
		const buf = Buffer.concat(this.#chunks);
		const diag = this.#parseDiag(buf);
		if (code !== 0) {
			return void reject(new PipeServerError(`EXE_EXIT`, code ?? -1, null, diag));
		}
		resolve({ detection: { diag } });
	}

	/** @param {Buffer} buf @returns {DiagData} */
	#parseDiag(buf) {
		/** @type {DiagData} */
		const empty = {
			parseError: null, rawSize: buf.length,
			payloadSize: 0, exitCode: 0, targetPid: 0, ssn: 0,
			prologueBytes: '', hwnd: 0,
			syscallStatus: 0x7FFFFFFF, syscallStatusDesc: 'not_called',
			affinity: 0xFFFFFFFF, win32uSigned: 0, windowCount: 0, osBuild: 0,
			windows: [],
		};
		if (!Buffer.isBuffer(buf) || buf.length < PipeServer.#DIAG_MIN_SIZE)
			return { ...empty, parseError: 'buffer_too_small' };
		if (buf.readUInt32LE(0) !== PipeServer.#DIAG_VERSION)
			return { ...empty, parseError: `version_mismatch(got ${buf.readUInt32LE(0)})` };
		const payloadSize = buf.readUInt32LE(4);
		if (buf.length < payloadSize)
			return { ...empty, payloadSize, parseError: `buffer_truncated(have ${buf.length} need ${payloadSize})` };
		const rawStatus = buf.readInt32LE(28);
		const windowCount = buf.readUInt8(37);
		const windows = [];
		let off = payloadSize;
		for (let i = 0; i < windowCount && off + PipeServer.#WINDOW_RECORD_SIZE <= buf.length; i++) {
			windows.push({
				hwnd:      buf.readUInt32LE(off),
				affinity:  buf.readUInt32LE(off + 4),
				title:     buf.subarray(off + 8, off + 72).toString('latin1').replace(/\0.*$/, ''),
				className: buf.subarray(off + 72, off + 104).toString('latin1').replace(/\0.*$/, ''),
			});
			off += PipeServer.#WINDOW_RECORD_SIZE;
		}
		return {
			parseError:        null,
			rawSize:           buf.length,
			payloadSize,
			exitCode:          buf.readUInt32LE(8),
			targetPid:         buf.readUInt32LE(12),
			ssn:               buf.readUInt32LE(16),
			prologueBytes:     Array.from(buf.subarray(20, 24)).map(b => b.toString(16).padStart(2, '0')).join(' '),
			hwnd:              buf.readUInt32LE(24),
			syscallStatus:     rawStatus,
			syscallStatusDesc: PipeServer.#describeSyscallStatus(rawStatus),
			affinity:          buf.readUInt32LE(32),
			win32uSigned:      buf.readUInt8(36),
			windowCount,
			osBuild:           buf.readUInt32LE(40),
			windows,
		};
	}

	/** @param {number} s @returns {string} */
	static #describeSyscallStatus(s) {
		if (s === 0x7FFFFFFF) return "not_called";
		if (s === 0x7FFFFFFE) return "ssn_was_zero";
		if (s === 0x7FFFFFFD) return "virtual_alloc_failed";
		if (s === 0x7FFFFFFC) return "virtual_protect_failed";
		if (s === 0x7FFFFFFB) return "unsupported_arch";
		if (s >= 0)           return "success";
		return `ntstatus_error(0x${(s >>> 0).toString(16).toUpperCase()})`;
	}

	/** @returns {string} */
	getPipeName() {
		return this.#pipeName;
	}
}

module.exports = { PipeServer, PipeServerError };

//--FILE-SEPARATOR--

const fs = require('fs');
const path = require('path');
const { exec, execFile } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Default PowerShell installation locations on Windows
 * Note: Only checking Windows PowerShell 5.1 for maximum compatibility
 * PowerShell Core (6.x and 7.x) are excluded to avoid compatibility issues with existing scripts
 */
const DEFAULT_POWERSHELL_PATHS = [
    // Windows PowerShell (5.1 and earlier) - 64-bit
    path.join(process.env.SYSTEMROOT || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),

    // Windows PowerShell (5.1 and earlier) - 32-bit
    path.join(process.env.SYSTEMROOT || 'C:\\Windows', 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
];

/**
 * Check if a file exists at the given path
 * @param {string} filePath - Path to check
 * @returns {boolean} True if file exists
 */
function fileExists(filePath) {
    try {
        return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    } catch (error) {
        return false;
    }
}

/**
 * Check if Windows PowerShell is available in system PATH
 * Note: Only checks for 'powershell.exe', not 'pwsh.exe' (PowerShell Core)
 * @returns {Promise<{inPath: boolean, path: string|null, version: string|null}>}
 */
async function checkPowerShellInPath() {
    try {
        // Only check for 'powershell' command (Windows PowerShell)
        // Do NOT check for 'pwsh' (PowerShell Core) to avoid compatibility issues
        const { stdout: psPath } = await execAsync('where powershell', { timeout: 5000 });
        const execPath = psPath.trim().split('\n')[0].trim();

        // Get version
        const { stdout: versionOutput } = await execAsync('powershell -Command "$PSVersionTable.PSVersion.ToString()"', { timeout: 5000 });

        return {
            inPath: true,
            path: execPath,
            version: versionOutput.trim(),
            type: 'Windows PowerShell'
        };
    } catch (error) {
        return {
            inPath: false,
            path: null,
            version: null,
            type: null
        };
    }
}

/**
 * Check Windows PowerShell at default installation locations
 * Note: Only checks for Windows PowerShell 5.1, not PowerShell Core
 * @returns {Array<{path: string, exists: boolean, version: string|null, type: string}>}
 */
async function checkDefaultLocations() {
    const results = [];

    for (const psPath of DEFAULT_POWERSHELL_PATHS) {
        const exists = fileExists(psPath);
        let version = null;
        let type = null;

        if (exists) {
            try {
                // Only Windows PowerShell is checked now (no pwsh.exe)
                type = 'Windows PowerShell';

                // Get version
                const command = `"${psPath}" -Command "$PSVersionTable.PSVersion.ToString()"`;
                const { stdout } = await execAsync(command, { timeout: 5000 });
                version = stdout.trim();
            } catch (error) {
                // Version check failed but file exists
                version = 'unknown';
            }
        }

        results.push({
            path: psPath,
            exists,
            version,
            type
        });
    }

    return results;
}

/**
 * Comprehensive Windows PowerShell availability check
 * Note: Only checks for Windows PowerShell 5.1, not PowerShell Core (6.x/7.x)
 * @returns {Promise<{
 *   available: boolean,
 *   inPath: object,
 *   defaultLocations: Array,
 *   recommendedPath: string|null
 * }>}
 */
async function checkPowerShell() {
    const inPath = await checkPowerShellInPath();
    const defaultLocations = await checkDefaultLocations();

    // Find first available PowerShell
    let recommendedPath = null;
    if (inPath.inPath) {
        recommendedPath = inPath.path;
    } else {
        const available = defaultLocations.find(loc => loc.exists);
        if (available) {
            recommendedPath = available.path;
        }
    }

    return {
        available: inPath.inPath || defaultLocations.some(loc => loc.exists),
        inPath,
        defaultLocations: defaultLocations.filter(loc => loc.exists),
        allLocations: defaultLocations,
        recommendedPath
    };
}

// Module-level cache — undefined = not yet checked, null = checked, not found
let _cachedPath;

/**
 * Get Windows PowerShell executable path (checks PATH first, then default locations).
 * Result is cached after the first call.
 * Note: Only returns Windows PowerShell 5.1 path, not PowerShell Core
 * @returns {Promise<string|null>} Path to PowerShell executable or null if not found
 */
async function getPowerShellPath() {
    if (_cachedPath === undefined) {
        const result = await checkPowerShell();
        _cachedPath = result.recommendedPath ?? null;
    }
    return _cachedPath;
}

/**
 * Returns true if PowerShell is available and executable on this system.
 * Caches the result after the first call so subsequent calls are instant.
 * @returns {Promise<boolean>}
 */
async function isPowerShellAvailable() {
    if (process.platform !== 'win32') return false;
    return (await getPowerShellPath()) !== null;
}

/**
 * Run a PowerShell script using the resolved powershell.exe path.
 * Migrated from stateChangeScript.js.
 * @param {object} opts
 * @param {string}   opts.script
 * @param {number}   [opts.timeoutMs=15000]
 * @param {string[]} [opts.flags]
 * @param {string}   [opts.name]
 * @returns {Promise<string>} stdout (trimmed)
 */
async function runPowerShell({ script, timeoutMs = 15000, flags = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command'], name = 'Default' }) {
    const psPath = await getPowerShellPath() || 'powershell.exe';
    return new Promise((resolve, reject) => {
        execFile(
            psPath,
            [...flags, script],
            { timeout: timeoutMs, windowsHide: true },
            (err, stdout, stderr) => {
                if (err) {
                    reject(new Error(
                        `PowerShell failed name=${name}: ${err.message} \n signal = ${err.signal} \n code = ${err.code} \nSTDERR: ${stderr || ''}\nSTDOUT: ${stdout || ''}\nscript: ${script}`
                    ));
                    return;
                }
                resolve(stdout.trim());
            }
        );
    });
}

module.exports = {
    checkPowerShell,
    checkPowerShellInPath,
    checkDefaultLocations,
    getPowerShellPath,
    isPowerShellAvailable,
    runPowerShell,
    DEFAULT_POWERSHELL_PATHS
};


//--FILE-SEPARATOR--

const { Worker } = require('worker_threads');
const path = require('path');

/**
 * Inline worker version of folder-hash (self-contained, no external deps)
 * @param {string} targetPath - Path to folder or file to hash
 * @param {object} [userOptions] - Optional hash config (algo, encoding, excludes)
 * @returns {Promise<object>} Folder-hash-like result { name, hash, children? }
 */
function folderHashInline(targetPath, userOptions = {}) {
    return new Promise((resolve, reject) => {
        const code = `
            const { parentPort, workerData } = require('worker_threads');
            const fs = require('fs');
            const path = require('path');
            const crypto = require('crypto');
            process.noAsar = true;

            const DEFAULTS = {
                algo: 'sha1',
                algoOptions: {},
                encoding: 'base64',
                files: {
                    exclude: [],
                    include: [],
                    matchBasename: true,
                    matchPath: false,
                    ignoreBasename: false,
                    ignoreRootName: false
                },
                folders: {
                    exclude: [],
                    include: [],
                    matchBasename: true,
                    matchPath: false,
                    ignoreBasename: false,
                    ignoreRootName: false
                },
                symbolicLinks: {
                    include: true,
                    ignoreBasename: false,
                    ignoreTargetPath: true,
                    ignoreTargetContent: false,
                    ignoreTargetContentAfterError: false
                }
            };

            function deepMerge(a, b) {
                const out = { ...a };
                for (const k of Object.keys(b || {})) {
                    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) {
                        out[k] = deepMerge(a[k] || {}, b[k]);
                    } else {
                        out[k] = b[k];
                    }
                }
                return out;
            }

            function ignore(name, fullPath, rules) {
                if (!rules) return false;
                if (Array.isArray(rules.exclude) && rules.exclude.length) {
                    if (rules.matchBasename && rules.exclude.includes(name)) return true;
                    if (rules.matchPath && rules.exclude.includes(fullPath)) return true;
                }
                return false;
            }

            function HashedFile(name, hash, encoding) {
                this.name = name;
                this.hash = hash.digest(encoding);
            }

            function HashedFolder(name, children, options, isRoot = false) {
                this.name = name;
                this.children = children;
                const h = crypto.createHash(String(options.algo || 'sha1'), options.algoOptions || {});
                if (!(options.folders.ignoreBasename || options.ignoreBasenameOnce || (isRoot && options.folders.ignoreRootName))) {
                    h.update(name);
                }
                for (const c of children) {
                    if (c && c.hash) h.update(c.hash);
                }
                this.hash = h.digest(options.encoding || 'base64');
            }

            function prep(fs) {
                async function hashElement(name, dir, options, isRoot = false) {
                    const full = path.join(dir, name);
                    const stats = await fs.promises.lstat(full);
                    stats.name = name;
                    if (stats.isDirectory()) return hashFolder(name, dir, options, isRoot);
                    if (stats.isFile()) return hashFile(name, dir, options, isRoot);
                    return undefined;
                }

                async function hashFolder(name, dir, options, isRoot = false) {
                    const folder = path.join(dir, name);
                    if (ignore(name, folder, options.folders)) return undefined;
                    const entries = await fs.promises.readdir(folder, { withFileTypes: true });
                    const children = await Promise.all(
                        entries
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map(e => hashElement(e.name, folder, options, false))
                    );
                    return new HashedFolder(name, children.filter(Boolean), options, isRoot);
                }

                function hashFile(name, dir, options, isRoot = false) {
                    const filePath = path.join(dir, name);
                    if (ignore(name, filePath, options.files)) return Promise.resolve(undefined);
                    return new Promise((resolve, reject) => {
                        try {
                            const h = crypto.createHash(String(options.algo || 'sha1'), options.algoOptions || {});
                            if (!(options.files.ignoreBasename || options.ignoreBasenameOnce || (isRoot && options.files.ignoreRootName))) {
                                h.update(name);
                            }
                            const s = fs.createReadStream(filePath);
                            s.on('error', reject);
                            s.on('end', () => resolve(new HashedFile(name, h, options.encoding || 'base64')));
                            s.pipe(h, { end: false });
                        } catch (e) { reject(e); }
                    });
                }

                return hashElement;
            }

            (async () => {
                try {
                    const userOpts = workerData.userOptions ? JSON.parse(workerData.userOptions) : {};
                    const options = deepMerge(DEFAULTS, userOpts);
                    const parsed = path.parse(workerData.targetPath);
                    const base = parsed.base;
                    const dir = parsed.dir;

                    if (!base || !dir) throw new Error('Invalid targetPath parts');

                    const hashElement = prep(fs);
                    const result = await hashElement(base, dir, options, true);
                    parentPort.postMessage({ ok: true, result });
                } catch (err) {
                    parentPort.postMessage({ ok: false, error: { message: err.message, stack: err.stack } });
                }
            })();
        `;

        const worker = new Worker(code, {
            eval: true,
            workerData: {
                targetPath: path.resolve(targetPath),
                userOptions: JSON.stringify(userOptions)
            }
        });

        worker.on('message', (m) => {
            if (m.ok) return resolve(m.result);
            const e = new Error(m.error.message);
            e.stack = m.error.stack;
            reject(e);
        });
        worker.on('error', reject);
        worker.on('exit', (code) => {
            if (code !== 0) reject(new Error('Worker exited with code ' + code));
        });
    });
}

module.exports = { folderHashInline }


//--FILE-SEPARATOR--

const axios = require('axios');
const config = require('../../config/config');

/**
 * @param {string} userId
 * @param {string} quizId
*/
async function getPresignedURL(userId, quizId) {
		const url = new URL("/getPresignedURL", config.QUIZ_STATIC);
		/** @type {import('axios').AxiosResponse<{ url: string, fields: Record<string, string> }>} */
		const result = await axios.post(url, {
				userId,
				quizId,
		});
		if (!result.data?.url) {
				throw new Error('Something went wrong unable to create presigned url');
		}
		return result.data;
}

/**
 * @param {File} image
 * @param {string} quizId
 * @param {string} userId
*/
async function uploadFileToStaticServer(image, quizId, userId) {
		if (!userId || !quizId || !image) {
				throw new Error(`Missing required parameters for uploadFileToStaticServer`);
		}
		const rawResponse = await getPresignedURL(userId, quizId);
		const url = new URL(rawResponse?.fields.key, rawResponse.url);
		await handleStaticFileUpload(rawResponse.url, image, rawResponse.fields);
		return url.toString();
}

/**
 * @param {string} presignedURL
 * @param {File} file
 * @param {Record<string, string>} fields
 * @param {{ timeout?: number }} options
*/
async function handleStaticFileUpload(presignedURL, file, fields = {}, options = {}) {
		const formData = new FormData;
		for (const key in fields) {
				formData.set(key, fields[key]);
		}
		formData.set('file', file);
		await axios({
				method: 'POST',
				url: presignedURL,
				data: formData,
				headers: {
						'Content-Type': 'multipart/form-data',
				},
				timeout: options.timeout ?? 2 * 60 * 1000,
		});
}

module.exports = {
	uploadFileToStaticServer,
};

//--FILE-SEPARATOR--

/**
 * connections.js
 * Drop-in module for listing active network connections with process names.
 * Windows-only build — uses PowerShell Get-NetTCPConnection / Get-NetUDPEndpoint
 * for reliable TCP + UDP capture (including outbound UDP traffic).
 *
 * Install dependency:  npm install systeminformation
 *
 * Usage:
 *   const { getConnections } = require('./connections');
 *   const list = await getConnections();
 *
 * Each item in the returned array:
 *   {
 *     proto:       'tcp' | 'udp'
 *     local:       '192.168.1.5:52341'
 *     remote:      '142.250.80.46:443'
 *     remoteIP:    '142.250.80.46'
 *     remotePort:  '443'
 *     state:       'ESTABLISHED' | 'SEND' | 'LISTEN' | ...
 *     pid:         '1234'
 *     processName: 'chrome.exe'
 *     isLAN:       true | false
 *   }
 */

'use strict';

const { isPowerShellAvailable, runPowerShell } = require('./powershellChecker');

// ── IP helpers ────────────────────────────────────────────────────────────────

function isLoopback(ip) {
  return (
    !ip ||
    ip === 'localhost' ||
    ip === '::1' ||
    ip.startsWith('127.') ||
    ip === '*' ||
    ip === '0.0.0.0' ||
    ip === '::'
  );
}

function isLANIP(ip) {
  return (
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}

// Format a remote address properly:
//   IPv4  →  1.2.3.4:443
//   IPv6  →  [2600:1901::]:443
function formatAddr(ip, port) {
  if (!ip) return '?';
  const isIPv6 = ip.includes(':');
  const host = isIPv6 ? `[${ip}]` : ip;
  return port ? `${host}:${port}` : host;
}

// ── Windows PowerShell helpers ────────────────────────────────────────────────

const PS_FLAGS = ['-NoProfile', '-NonInteractive', '-Command'];

/**
 * Returns a pid→{ name, company, path } map using Get-Process.
 * Company and Path are used to determine whether the process is a Microsoft app.
 */
async function getPidMap() {
  const script = `
    Get-Process -ErrorAction SilentlyContinue |
    Select-Object Id, Name,
      @{N='Company';E={try{$_.Company}catch{$null}}},
      @{N='Path';E={try{$_.Path}catch{$null}}} |
    ConvertTo-Json -Compress
  `;
  const raw = await runPowerShell({ script, flags: PS_FLAGS });
  const list = JSON.parse(raw || '[]');
  const map = {};
  const procs = Array.isArray(list) ? list : [list];
  for (const p of procs) {
    if (p && p.Id != null) {
      map[p.Id] = {
        name:    p.Name    || '?',
        company: p.Company || null,
        path:    p.Path    || null,
      };
    }
  }
  return map;
}

/**
 * Windows kernel/system processes (reliably):
 * - PID 0: System Idle Process
 * - PID 4: System
 *
 * Anything else is NOT a kernel process.
 */
function isKernelProcess(pid) {
  const p = Number(pid);
  return p === 0 || p === 4;
}

/**
 * Returns true  — process is a Microsoft app (company name contains "Microsoft")
 *         false — process has a company name but it is not Microsoft
 *         null  — cannot determine (kernel threads, unsigned system processes)
 */
function isMicrosoftProcess(info) {
  if (!info) return null;
  const company = (info.company || '').toLowerCase();
  if (company.includes('microsoft')) return true;
  if (company) return false;
  // No company info — fall back to path heuristic for system processes
  const p = (info.path || '').toLowerCase().replace(/\//g, '\\');
  if (p && (
    p.startsWith('c:\\windows\\system32\\') ||
    p.startsWith('c:\\windows\\syswow64\\') ||
    p.startsWith('c:\\windows\\winsxs\\') ||
    p.startsWith('c:\\program files\\windowsapps\\microsoft.')
  )) return true;
  return null;
}

/**
 * Fetches TCP connections via Get-NetTCPConnection.
 * Only ESTABLISHED state is included (mirrors original TCP behaviour).
 */
async function getTCPConnections() {
  const script = `
    Get-NetTCPConnection -State Established |
    Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State, OwningProcess |
    ConvertTo-Json -Compress
  `;
  const raw = await runPowerShell({ script, flags: PS_FLAGS });
  const list = JSON.parse(raw || '[]');
  return Array.isArray(list) ? list : [list];
}

/**
 * Fetches UDP endpoints via Get-NetUDPEndpoint.
 *
 * UDP is connectionless, so Get-NetUDPEndpoint only shows open sockets
 * (bound local ports), not per-packet destinations.  To capture actual
 * outbound destinations we additionally tail the live netstat output for
 * any UDP rows that have a non-zero remote address.
 *
 * Returns an array of pseudo-connection objects normalised to the same
 * shape as TCP rows.
 */
async function getUDPConnections() {
  // ① Open UDP sockets from Get-NetUDPEndpoint (gives us pid reliably)
  const socketScript = `
    Get-NetUDPEndpoint |
    Select-Object LocalAddress, LocalPort, OwningProcess |
    ConvertTo-Json -Compress
  `;

  // ② Live UDP rows from netstat that have a real RemoteAddress
  //    netstat -ano shows UDP rows with a remote only when a packet was
  //    recently sent (Windows keeps ephemeral state for ~2 s).
  const netstatScript = `
    $lines = netstat -ano | Select-String 'UDP'
    $results = foreach ($line in $lines) {
      $parts = ($line -replace '\\s+', ' ').Trim() -split ' '
      if ($parts.Count -ge 4) {
        $local  = $parts[1]
        $remote = $parts[2]
        $pid    = $parts[-1]
        if ($remote -ne '*:*' -and $remote -ne '0.0.0.0:*' -and $remote -ne '[::]:*') {
          [PSCustomObject]@{ Local=$local; Remote=$remote; PID=$pid }
        }
      }
    }
    if ($results) { $results | ConvertTo-Json -Compress } else { '[]' }
  `;

  const [sockRaw, nsRaw] = await Promise.all([
    runPowerShell({ script: socketScript, flags: PS_FLAGS }),
    runPowerShell({ script: netstatScript, flags: PS_FLAGS }),
  ]);

  const sockets = (() => {
    const parsed = JSON.parse(sockRaw || '[]');
    return Array.isArray(parsed) ? parsed : [parsed];
  })();

  const nsRows = (() => {
    const parsed = JSON.parse(nsRaw || '[]');
    return Array.isArray(parsed) ? parsed : [parsed];
  })();

  // Normalise socket list (no real remote — mark as LAN/internet unknown)
  const fromSockets = sockets.map(s => ({
    proto:        'udp',
    localAddress: s.LocalAddress || '',
    localPort:    String(s.LocalPort || ''),
    remoteAddress: null,   // unknown for bound sockets
    remotePort:   null,
    pid:          s.OwningProcess,
    _source:      'socket',
  }));

  // Normalise netstat rows (have a real remote — most useful for our purpose)
  const fromNetstat = nsRows.map(r => {
    const [la, lp] = splitAddr(r.Local);
    const [ra, rp] = splitAddr(r.Remote);
    return {
      proto:        'udp',
      localAddress: la,
      localPort:    lp,
      remoteAddress: ra,
      remotePort:   rp,
      pid:          r.PID,
      _source:      'netstat',
    };
  });

  // Merge: prefer netstat rows (they have remotes); fill gaps with socket rows
  // De-duplicate on localPort+pid
  const seen = new Set();
  const merged = [];
  for (const row of [...fromNetstat, ...fromSockets]) {
    const key = row.pid;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(row);
    }
  }
  return merged;
}

/** Split "1.2.3.4:443" or "[::1]:53" into [ip, port] */
function splitAddr(addr) {
  if (!addr) return ['', ''];
  if (addr.startsWith('[')) {
    // IPv6
    const m = addr.match(/^\[(.+)\]:(\d+)$/);
    return m ? [m[1], m[2]] : [addr, ''];
  }
  const idx = addr.lastIndexOf(':');
  if (idx === -1) return [addr, ''];
  return [addr.slice(0, idx), addr.slice(idx + 1)];
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {object}  [opts]
 * @param {boolean} [opts.includeLAN=true]      Include LAN connections
 * @param {boolean} [opts.includeInternet=true] Include internet connections
 * @param {boolean} [opts.includeUDP=true]      Include UDP endpoints/traffic
 * @param {number}  [opts.excludePid]           PID to exclude (e.g. process.pid)
 * @returns {Promise<Array>}
 */
async function getConnections(opts = {}) {
  if (process.platform !== 'win32') {
    throw new Error('connections.js (Windows build) only supports win32.');
  }

  if (!await isPowerShellAvailable()) {
    return { available: false, error: 'PowerShell not found on this system.' };
  }

  const {
    includeLAN      = true,
    includeInternet = true,
    includeUDP      = true,
    excludePid      = null,
    groupByProcess  = true,
  } = opts;

  // Fetch everything in parallel
  const [tcpRaw, udpRaw, pidMap] = await Promise.all([
    getTCPConnections(),
    includeUDP ? getUDPConnections() : Promise.resolve([]),
    getPidMap(),
  ]);

  const results = [];

  // ── TCP ──────────────────────────────────────────────────────────────────
  for (const c of tcpRaw) {
    const remoteIP = c.RemoteAddress || '';
    if (!remoteIP || isLoopback(remoteIP)) continue;

    const pid = c.OwningProcess;
    if (excludePid && pid && Number(pid) === excludePid) continue;

    const lan = isLANIP(remoteIP);
    if (lan && !includeLAN) continue;
    if (!lan && !includeInternet) continue;

    const pidInfo = pidMap[pid] || null;
    results.push({
      proto:          'tcp',
      local:          formatAddr(c.LocalAddress, c.LocalPort),
      remote:         formatAddr(remoteIP, c.RemotePort),
      remoteIP,
      remotePort:     String(c.RemotePort || '?'),
      state:          'ESTABLISHED',
      pid:            String(pid || '?'),
      processName:    (pidInfo && pidInfo.name) || '?',
      isKernel:       isKernelProcess(pid),
      isMicrosoftApp: isMicrosoftProcess(pidInfo),
      isLAN:          lan,
    });
  }

  // ── UDP ──────────────────────────────────────────────────────────────────
  for (const c of udpRaw) {
    // For socket-only rows (no remote), skip unless caller wants LAN/all
    const remoteIP = c.remoteAddress || '';

    // If we have a remote, apply the same loopback + LAN filters
    if (remoteIP) {
      if (isLoopback(remoteIP)) continue;
      const lan = isLANIP(remoteIP);
      if (lan && !includeLAN) continue;
      if (!lan && !includeInternet) continue;

      const pid = c.pid;
      if (excludePid && pid && Number(pid) === excludePid) continue;

      const pidInfo = pidMap[pid] || null;
      results.push({
        proto:          'udp',
        local:          formatAddr(c.localAddress, c.localPort),
        remote:         formatAddr(remoteIP, c.remotePort),
        remoteIP,
        remotePort:     String(c.remotePort || '?'),
        state:          'SEND',          // UDP has no real state; label as SEND
        pid:            String(pid || '?'),
        processName:    (pidInfo && pidInfo.name) || '?',
        isKernel:       isKernelProcess(pid),
        isMicrosoftApp: isMicrosoftProcess(pidInfo),
        isLAN:          isLANIP(remoteIP),
      });
    } else {
      // No remote known — include as a bound UDP socket (state: OPEN)
      // so callers can at least see what processes have UDP sockets open
      const pid = c.pid;
      if (excludePid && pid && Number(pid) === excludePid) continue;

      const localIP = c.localAddress || '';
      if (isLoopback(localIP) && localIP !== '') continue;

      const pidInfo = pidMap[pid] || null;
      results.push({
        proto:          'udp',
        local:          formatAddr(c.localAddress, c.localPort),
        remote:         null,
        remoteIP:       null,
        remotePort:     null,
        state:          'OPEN',
        pid:            String(pid || '?'),
        processName:    (pidInfo && pidInfo.name) || '?',
        isKernel:       isKernelProcess(pid),
        isMicrosoftApp: isMicrosoftProcess(pidInfo),
        isLAN:          false,
      });
    }
  }

  if (!groupByProcess) return results;

  // ── Aggregate by processName ──────────────────────────────────────────────
  const byProcess = new Map();

  for (const conn of results) {
    const key = conn.processName;
    if (!byProcess.has(key)) {
      byProcess.set(key, {
        processName:    conn.processName,
        isKernel:       conn.isKernel,
        isMicrosoftApp: conn.isMicrosoftApp,
        connections:    [],
      });
    }
    byProcess.get(key).connections.push(conn);
  }

  const processes = Array.from(byProcess.values());
  return {
    total:            processes.length,
    totalConnections: results.length,
    processes,
  };
}

/**
 * Returns connections grouped by unique PID.
 * Each entry: { pid, processName, isKernel, isMicrosoftApp, connections: <count> }
 *
 * Accepts the same options as getConnections (except groupByProcess).
 */
async function getConnectionsByPid(opts = {}) {
  const flat = await getConnections({ ...opts, groupByProcess: false });
  if (!Array.isArray(flat)) return flat; // error / unavailable passthrough

  const byPid = new Map();
  for (const conn of flat) {
    const key = conn.pid;
    if (!byPid.has(key)) {
      byPid.set(key, {
        pid:             conn.pid,
        processName:     conn.processName,
        isKernel:        conn.isKernel,
        isSystemProcess: conn.isMicrosoftApp === true,
        connections:     0,
      });
    }
    byPid.get(key).connections++;
  }

  const pids = Array.from(byPid.values());
  return {
    total:            pids.length,
    totalConnections: flat.length,
    pids,
  };
}

module.exports = { getConnections, getConnectionsByPid, isLoopback, isLANIP, formatAddr };

//--FILE-SEPARATOR--

class ImageBufferInfo {
	/**
	 * @param {Buffer} buffer
	 * @param {{ name?: string }} options
	*/
	constructor(buffer, options = {}) {
		this.name = options.name ?? `image_${Date.now()}`;
		this.buffer = buffer;
		this.size = new.target.getReadableSize(buffer.length);
	}

	get file() {
		return new File([this.buffer], `${this.name}.png`, { type: 'image/png' });
	}

	/** @param {number} size */
	static getReadableSize(size) {
		const units = { 1: 'B', 1024: 'KB', [1024 ** 2]: 'MB', [1024 ** 3]: 'GB', [1024 ** 4]: 'TB' };
		let unit = 'B';
		for (const [threshold, u] of Object.entries(units)) {
			if (size >= threshold) {
				unit = u;
			} else {
				break;
			}
		}
		return `${(size / (1024 ** Math.floor(Math.log(size) / Math.log(1024)))).toFixed(2)} ${unit}`;
	}
}

module.exports = { ImageBufferInfo };

//--FILE-SEPARATOR--

const { is } = require('@electron-toolkit/utils');
const os = require('os');
const { exec, fork } = require('child_process');
const logger = require('electron-log');
const path = require('path');
const crypto = require('crypto');
const checkDiskSpace = require('check-disk-space').default;
const config = require('./config');
const { execFile } = require("child_process");
const { utils } = require('../libs');
const { PipeServer } = require('./pipe-server/pipe-server.js');
const fs = require('fs');
const {isPowerShellAvailable, runPowerShell} = require('../util/powershellChecker.js')

const extraResourcesPath = config.extraResourcesPath ?? '';
const pathToTheDisplayCheck = path.join(extraResourcesPath, '/monitorDetect.exe');
const pathToTheContentProtectionCheckExecutable = path.join(extraResourcesPath, '/core.exe');

const pipeServer = new PipeServer({ exePath: pathToTheContentProtectionCheckExecutable });

function getExecutableSuffix() {
    const ext = process.platform === "win32" ? ".exe" : "";
    return `-${process.platform}-${process.arch}${ext}`;
}

const pathToVMExecutable = path.join(extraResourcesPath, '/license/build', 'license' + getExecutableSuffix());

let processes_to_stop = ['explorer', 'monica', 'anydesk', 'getscreen', 'VoiceAccess', 'chrome', 'msedge', 'firefox', 'opera', 'brave', 'discord', 'teams', 'zoom', 'teamviewer', 'spacedesk', 'code', 'claude', 'ChatGPT', 'Perplexity', 'PowerToys'];
if (is.dev) {
    processes_to_stop = [];
}

const VMs = ['virtual machine', 'virtualbox', 'qemu', 'vmware', 'parallel', 'utm', 'xen'];
const minimumRequiredMemory = 1024 * 1024 * 1024 * 2;
const { folderHashInline } = require('./hash');
const { app } = require('electron');
const { uploadFileToStaticServer } = require('../libs/upload/file-upload.js');
const { getConnections } = require('../util/connections.js');
const { ImageBufferInfo } = require('../util/buffer-util.js');

const vmConstants = {
    'vmware': 1,
    'virtualBox': 2,
    'hyperV': 3,
    'parallels': 4,
    'qemu': 5,
    'xen': 6,
    'docker': 7,
    'azure': 8,
    'aws': 9,
};


function EncryptionKey() {
    const obfuscated = /** @type {const} */ ([
        0x2F, 0x7D, 0x7E, 0x7E, 0x2F, 0x2D, 0x7D, 0x2B, 0x2F, 0x7B, 0x78, 0x2F, 0x7C, 0x28, 0x7C, 0x7B, 0x2F, 0x7A, 0x2B, 0x7D, 0x7D, 0x28, 0x7A, 0x2D, 0x2B, 0x2C, 0x7F, 0x7F, 0x7E, 0x77, 0x7B, 0x7E
    ]);
    return obfuscated.map(b => String.fromCharCode(b ^ 0x4E)).join('');
}
const VM_DETECT_SECRET = EncryptionKey();

const vmNumberToName = Object.entries(vmConstants).reduce((result, [key, value]) => {
    result[value] = key;
    return result;
}, {});

const invalidMacAddressesMap = new Map([
    ['00:50:56', vmConstants.vmware],
    ['00:0C:29', vmConstants.vmware],
    ['00:0F:69', vmConstants.vmware],
    ['08:00:27', vmConstants.virtualBox],
    ['00:15:5D', vmConstants.hyperV],
    ['00:1C:42', vmConstants.parallels],
    ['00:03:FF', vmConstants.parallels],
    ['52:54:00', vmConstants.qemu],
    ['00:16:3E', vmConstants.xen],
    ['02:42:AC', vmConstants.docker],
    ['00:22:48', vmConstants.azure],
    ['02:0F:B5', vmConstants.aws],
]);

function normalizeMac(mac) {
    if (!mac || typeof mac !== 'string') return null;
    return mac
        .toUpperCase()
        .replace(/-/g, ':')
        .replace(/[^0-9A-F:]/g, '');
}

function matchMacVendor(mac, invalidMacAddressesMap) {
    const normalized = normalizeMac(mac);
    if (!normalized) return null;
    const oui = normalized.slice(0, 8);
    for (const [invalidOui, vendor] of invalidMacAddressesMap.entries()) {
        if (oui === invalidOui) {
            return { matched: true, oui: invalidOui, vendor };
        }
    }
    return null;
}

const ExitCodeToErrorMessage = {
    20: 'Please disconnect multiple display before starting App.',
    23: 'Please provide full file access to the app.',
};

/**
 * @param {(string | undefined)[]} paths
 * @param {string | undefined} pathInBetween Empty string (i.e. "") if there is no folder in between
 * @param {string} executableFileName
*/
function findExecutableInPaths(paths, pathInBetween, executableFileName) {
    for (const searchPath of paths) {
        if (searchPath === undefined) {
            continue;
        }
        const candidate = path.join(searchPath, pathInBetween, executableFileName);
        try {
            fs.accessSync(candidate, fs.constants.X_OK);
            return candidate;
        } catch (error) {
            logger.error('Error S_EX', error);
        }
    }
}

const taskkillExe = function get_taskkill_path() {
    if (process.platform !== 'win32') {
        return 'taskkill';
    }
    const roots = [
        process.env.SystemRoot,
        process.env.WINDIR,
        'C:\\Windows',
        'D:\\Windows',
    ];
    return findExecutableInPaths(roots, 'System32', 'taskkill.exe') || 'taskkill';
}();

const explorerExe = function get_explorer_path() {
    if (process.platform !== 'win32') {
        return 'explorer';
    }
    const roots = [
        process.env.SystemRoot,
        process.env.WINDIR,
        'C:\\Windows',
        'D:\\Windows',
    ];
    return findExecutableInPaths(roots, '', 'explorer.exe') || 'explorer';
}();

const processes_to_start = [ explorerExe ];

const preStartCheckScript = (() => {
    switch (os.platform()) {
        case 'darwin':
            return `if [ $(system_profiler SPDisplaysDataType | grep -c Resolution) -gt 1 ]; then \nexit 20\nfi`;
    }
})();

/** @returns {Promise<boolean>} */
const runner = (script) => {
    return new Promise((resolve, reject) => {
        logger.log(script);
        if (!script) return resolve(true);
        exec(script, (error, stdout, stderr) => {
            if (stderr || error) logger.error('Error while executing handler script');
            if (error?.code) {
                logger.error(error);
                const message = ExitCodeToErrorMessage[error.code];
                if (message) return reject(message);
            }
            logger.log(`STDOUT: `, stdout);
            resolve(true);
        });
    });
};

/**
 * @param {import("electron").BrowserWindow} browserWindow
 */
const checkContentProtectionForWindows = async (browserWindow) => {
    const contentProtectionResult = await pipeServer.run(browserWindow);
    console.log('got protection result');
    const isContentProtectionOn = "detection" in contentProtectionResult;
    const isContentProtectionBypassed = !isContentProtectionOn;
    return { isContentProtectionBypassed, contentProtectionResult };
};

/**
 * 
 * @param {(data: ReturnType<typeof utils["encodePayload"]> | { payload: Record<"error", { name: string; message: string; code?: number; stack?: string; cause?: unknown }> }) => void} onContentProtectionViolationDetected
 */
async function collectData(data, onContentProtectionViolationDetected) {
    try {
        const encData = utils.encodePayload(data);
        onContentProtectionViolationDetected(encData);
    } catch (ex) {
        logger.error('Error CPV# data', ex);
        const error = ex instanceof Error ? ex : new Error(String(ex));
        onContentProtectionViolationDetected({
            payload: {
                error: {
                    name: error.name,
                    message: error.message,
                    code: 160,
                    stack: error.stack
                }
            },
        });
    }
}

const checkForMonitorCountForWindowsUsingC = () => {
    return new Promise((resolve, reject) => {
        execFile(pathToTheDisplayCheck, (error, stdout, stderr) => {
            if (stderr || error) logger.error('Error while checking for monitor count');
            if (error?.code) {
                logger.error(error);
                const message = ExitCodeToErrorMessage[error.code];
                if (message) return reject(message);
            }
            resolve(true);
        });
    });
};

const checkForMonitorCountForWindowsUsingPowerShell = () => {
    return new Promise((resolve, reject) => {
        let command = `(Get-CimInstance -Namespace root\\wmi -ClassName WmiMonitorBasicDisplayParams).Length`;
        command = `powershell.exe -Command "${command}"`;
        exec(command, (error, stdout, stderr) => {
            if (stderr || error) logger.error(`Error while Checking For Monitor Count`);
            if (error?.code) {
                logger.error(error);
                const message = ExitCodeToErrorMessage[error.code];
                if (message) return reject(message);
            }
            resolve(true);
        });
    });
};

class ExecCommand {

    #programManager;

    /** @param {import('./programManager.js')} programManager */
    constructor(programManager) {
        this.#programManager = programManager;
    }

    async strictModeScript(enableStrictMod) {
        switch (os.platform()) {
            case 'win32': {
                let processIdTOExclude = process.pid;
                if (enableStrictMod && !is.dev) {
                    const command = `NETSTAT.EXE -ano | findstr /c:'UDP' /c:'ESTABLISHED' | ForEach-Object { if ($_ -match '\\s*(\\d+)\\s*$') { $ParentProcess = (Get-WmiObject Win32_Process -Filter "ProcessId=$($matches[0])" | Select-Object -ExpandProperty ParentProcessId); if ($ParentProcess -and [int]$ParentProcess -ne ${processIdTOExclude} -and [int]$matches[0] -ne ${processIdTOExclude}) {Stop-Process -Id $ParentProcess -Force -ErrorAction SilentlyContinue; Stop-Process -Id $matches[0] -Force -ErrorAction SilentlyContinue } } }`
                    await runPowerShell({script: command, timeoutMs: 60000});
                }
                break;
            }
            case 'darwin': {
                const command = `if [ $(system_profiler SPDisplaysDataType | grep -c Resolution) -gt 1 ]; then \nexit 20\nfi`;
                await runner(command);
            }
        }
    }

    async taskKill() {
        const kills = processes_to_stop.map(single_process => {
            const imageName = `${single_process}.exe`;
            return new Promise((resolve) => {
                try {
                    execFile(taskkillExe, ['/IM', imageName, '/F'], (error, stdout, stderr) => {
                        if (error) {
                            const stdError = stderr ?? stdout;
                            const stdErrorLCase = stdError.toLowerCase();
                            let processNotFound = stdErrorLCase.includes('not found');
                            processNotFound ||= stdErrorLCase.includes('no running instance of the task');
                            if (!processNotFound) {
                                this.#programManager.setTaskKillData({
                                    error: {
                                        code: error.code,
                                        signal: error.signal,
                                        message: error.message
                                    },
                                    std: stdError
                                });
                            }
                        }
                        resolve(null);
                    });
                } catch (error) {
                    resolve(null);
                    console.log(`Error while KP ${imageName}:`, error);
                }
            });
        });
        await Promise.all(kills);
    }

    async startProcesses() {
        const promises = processes_to_start.map(executableName => {
            return new Promise(resolve => {
                try {
                    execFile(executableName, [], (error, stdout, stderr) => {
                        if (error) {
                            console.log(`Error while starting %s: code: %s | signal: %s | stdout: %s | stderr: %s`, executableName, error.code, error.signal, stdout || "-", stderr || "-");
                        }
                        resolve(null);
                    });
                } catch (error) {
                    resolve(null);
                    console.log(`Error while starting ${executableName}:`, error.message);
                }
            });
        });
        await Promise.all(promises);
    }


    #lastActiveNetworkConnectionsTime = 0;
    #activeNetworkConnectionsData = {};
    #activeNetworkConnectionsPending = false;

    async #fetchActiveConnectionsIfReady() {
        const now = Date.now();
        if (now - this.#lastActiveNetworkConnectionsTime < 60_000) return;
        if (this.#activeNetworkConnectionsPending) return;

        logger.log('Strict getting gC', now - this.#lastActiveNetworkConnectionsTime);
        this.#activeNetworkConnectionsPending = true;
        let later;
        try {
            const activeConnections = await getConnections();
            later = Date.now();
            this.#activeNetworkConnectionsData = { activeConnections, elapsedTimeMs: later - now };
        } catch (ex) {
            logger.error('Error getting sMR.aC');
            this.#activeNetworkConnectionsData = { msg: ex.toString(), trace: ex.stack };
        } finally {
            this.#activeNetworkConnectionsPending = false;
            this.#lastActiveNetworkConnectionsTime = later ?? Date.now();
        }
    }

    /** @param {{ config: import('../util').ServerConfig; isAdmin: boolean; mainWindowInstance: Electron.BrowserWindow; quizId: string; userId: string; processCheck: any; isInjectedInput: any; dataCollectionData: Record<string, unknown> | null; overlayReports: any; onContentProtectionViolationDetected: any }} args0 */
    async strictMode({ onContentProtectionViolationDetected }) {
        const {quizId, userId, config, isAdmin, mainWindow}  = this.#programManager;
        
        if (os.platform() == 'darwin') return this.checkMulipleMonitor(config);

        const strictModeStartTime = Date.now();
        let strictModeResult = {
            processCheck: {},
            overlayCheck: {},
            temperingCheck: {},
            multipleMonitorCheck: {},
            networkCheck: this.#activeNetworkConnectionsData,
            inputCheck: {},
            taskKillData: {},
            netstatKillFailedData: {}
        };
        this.#activeNetworkConnectionsData = {};

        await this.taskKill();

        try {
            await this.strictModeScript(!config.win32.disableStrictCheck && !isAdmin);
        } catch (ex) {
            if (process.platform === 'win32') {
                const error = ex instanceof Error ? ex : new Error(String(ex));
                this.#programManager.setNetstatKillFailedData({ error: error.toString() });
            }
            logger.log(ex);
        }

        try {
            const startTime = Date.now();
            if (false && isAdmin) {
                await this.blockWirelessMirroring().catch((e) => logger.error('Error blocking wireless mirroring', e));
            }

            const res = await this.shouldCheckScreens(config, quizId) || { status : false, debug : false};
            const debug = res.debug;
            strictModeResult.temperingCheck.shouldCheck = res;
            debug && logger.log("shouldCheckScreens result: ", res);
            if(res && res.status) {
                logger.log("Performing advanced tempering detection...");
                let result;
                try {
                    const temperingResult = await checkTempering({ mainWindow, config, debug }) || {};
                    const imagesUrlEntries = temperingResult.images?.map(async info => {
                        let value;
                        try {
                            const url = await uploadFileToStaticServer(info.file, quizId, userId);
                            value = url;
                        } catch(ex) {
                            const error = ex instanceof Error ? ex.stack ?? ex.message : String(ex);
                            value = { error };
                        }
                        return /** @type {const} */ ([ info.name, value ]);
                    }) ?? [];
                    let images;
                    try {
                        const imageEntries = await Promise.all(imagesUrlEntries);
                        images = Object.fromEntries(imageEntries);
                    } catch (ex) {
                        images = { error: ex instanceof Error ? ex.stack ?? ex.message : String(ex) };
                    }
                    result = Object.assign({}, temperingResult, { images });
                } catch (ex) {
                    logger.error('Error during tempering check', ex);
                    result = { error: ex.toString(), stack: ex.stack };
                }
                strictModeResult.temperingCheck.result = result;
                strictModeResult.temperingCheck.timeElapsed = Date.now() - startTime;
            } else {
                logger.log("Skipping advanced tempering detection as per config");
            }
        } catch (error) {
            console.log('failed in check', error);
            strictModeResult.temperingCheck.error = {
                msg: error.toString(),
                trace: error.stack,
            };
            logger.log("error in advanced tempering detection: ", error.toString());
        }
        strictModeResult.timeTakenMs = Date.now() - strictModeStartTime;

        await this.#fetchActiveConnectionsIfReady();

        if (process.platform === 'win32') {
            const { isContentProtectionBypassed, contentProtectionResult } = await checkContentProtectionForWindows(mainWindow);
            if (isContentProtectionBypassed) {
                this.#programManager.startDataCollection("contentProtection");
            }
            const dataCollectionData = this.#programManager.dataCollectionData;
            if (dataCollectionData !== null) {
                const flushData = this.#programManager.flushCollectedData();
                strictModeResult.inputCheck = flushData.isInjectedInput ?? {};
                strictModeResult.overlayCheck.overlayReports = flushData.overlayReports;
                strictModeResult.processCheck = flushData.processCheck ?? [];
                strictModeResult.taskKillData = this.#programManager.taskKillData ?? {};
                strictModeResult.netstatKillFailedData = this.#programManager.netstatKillFailedData ?? {};
                this.#programManager.setTaskKillData(null);
                this.#programManager.setNetstatKillFailedData(null);
                const data = Object.assign(contentProtectionResult, { strictModeResult, dataCollectionData });
                if (!this.#programManager.dataCollectionLimitReached) {
                    this.#programManager.countCollectedData();
                    collectData(data, onContentProtectionViolationDetected);
                }
            }
        }
        return strictModeResult;
    }

    blockWirelessMirroring() {
        if (os.platform() !== 'win32') return Promise.resolve(true);
        return runner(`reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Connect" /f ; reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Connect" /v AllowProjectionToPC /t REG_DWORD /d 0 /f `);
    }

    async shouldCheckScreens( config, quizId )  {
        try {
            const { screenTemperingDetection } = config;
            if( !screenTemperingDetection) {
                throw new Error("Advanced tempering detection config not present");
            }

            const { status= true, debug = false, exceptionQuizzes=  []} = screenTemperingDetection;
            if( status ) {
                console.log("Advanced tempering detection is enabled");
                return { status, debug};
            }

            if( quizId ) {
                console.log("Current Quiz ID: ", quizId);
                if( !exceptionQuizzes || exceptionQuizzes.length === 0 ) {
                    throw new Error("No exception quizzes present");
                }
                if( exceptionQuizzes.includes(quizId) ) {
                    console.log("Quiz is present in exception list");
                    return { status : true, debug };
                }
            }  
            throw new Error("No need to collect more data for for advanced tempering detection");

        }catch (error) {
            throw new Error('Error while checking for advanced tempering detection config' + error.toString());
        }
    }

    async removeStrictMode() {
        await this.startProcesses();
    }

    checkForFullDiskAccess() {
        if (os.platform() == 'darwin') {
            return new Promise((resolve, reject) => {
                const process = fork(path.join(__dirname, '../worker/macOsScreenShareStop.mjs'));
                process.on('message', (...message) => { logger.info('FROM WORKER', ...message); });
                process.on('exit', (code) => {
                    if (code === 23) return reject(ExitCodeToErrorMessage[code]);
                    return resolve();
                });
            });
        }
    }

    /**
   * 
   * @param {import('../util').ServerConfig} config 
   * @returns 
   */
    async #checkMulipleMonitor_internal(config) {
        if (os.platform() === 'darwin') return runner(preStartCheckScript);
        if (os.platform() === 'win32') {
            switch (config.win32.multipleWindowDetectionType) {
                case 0: return checkForMonitorCountForWindowsUsingC();
                case 1: return checkForMonitorCountForWindowsUsingPowerShell();
                case 2: return;
            }
        }
    }
    /**
   * 
   * @param {import('../util').ServerConfig} config 
   * @returns 
   */
    async checkMulipleMonitor(config) {
        try {
            const result = await this.#checkMulipleMonitor_internal(config);
            this.#programManager.sendStrictModeLockToFrontend(false);
            return result;
        } catch (ex) {
            this.#programManager.sendStrictModeLockToFrontend(true);
            console.error('Error during checking mm', ex);
        }
    }

    async preStartCheck(config) {
        return this.checkMulipleMonitor(config);
    }
}


/**
 * @param {{ mainWindow: import('electron').BrowserWindow, debug?: boolean }} args0
*/
const checkTempering = async ({ mainWindow, debug = false }) => {

    const sharp = require('sharp');
    const screen = require("electron").screen;
    const ts = Date.now();
    const { desktopCapturer, app } = require('electron');

    debug && console.log(`[detect] === Starting tempering check at ${ts} ===`);
    const debugDir = path.join(app.getPath('logs'), "slogs");
    if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);

    // 0) Ensure window is visible and in foreground before capturing
    debug && logger.log(`[detect] Window state: isMinimized=${mainWindow.isMinimized()}, isVisible=${mainWindow.isVisible()}, isFocused=${mainWindow.isFocused()}, isDestroyed=${mainWindow.isDestroyed()}`);
    if (mainWindow.isMinimized()) {
        mainWindow.restore();
    }
    if (!mainWindow.isVisible()) {
        mainWindow.show();
    }
    // Force window to foreground using setAlwaysOnTop trick (works reliably on Windows)
    mainWindow.setAlwaysOnTop(true);
    mainWindow.focus();
    mainWindow.moveTop();
    // Release alwaysOnTop after it has come to front
    await new Promise(resolve => setTimeout(resolve, 300));
    mainWindow.setAlwaysOnTop(false);
    // Wait for repaint
    await new Promise(resolve => setTimeout(resolve, 500));
    debug && logger.log(`[detect] After bring-to-front: isMinimized=${mainWindow.isMinimized()}, isVisible=${mainWindow.isVisible()}, isFocused=${mainWindow.isFocused()}`);

    // 2) Geometry & Display Identification (sync — must happen before captures to compute thumbnailSize)
    const content = mainWindow.getContentBounds();
    debug && logger.log(`[detect] Step 2: Window contentBounds: x=${content.x}, y=${content.y}, w=${content.width}, h=${content.height}`);

    const display = screen.getDisplayMatching(content);
    const scale = display.scaleFactor;
    debug && logger.log(`[detect] Electron matched display: id=${display.id}, bounds=`, display.bounds, `scaleFactor=${scale}`);

    const allDisplays = screen.getAllDisplays();
    debug && logger.log(`[detect] All Electron displays (${allDisplays.length}):`);
    allDisplays.forEach((d, i) => {
        debug && logger.log(`[detect]   [${i}] id=${d.id}, bounds=x:${d.bounds.x},y:${d.bounds.y},w:${d.bounds.width},h:${d.bounds.height}, scale=${d.scaleFactor}`);
    });

    const targetPhysicalW = Math.round(display.bounds.width * scale);
    const targetPhysicalH = Math.round(display.bounds.height * scale);

    // 1+3) Fire app capture and screen capture in parallel to minimize the time gap between them
    debug && logger.log(`[detect] Steps 1+3: Capturing app page and screen simultaneously...`);
    const [appImg, sources] = await Promise.all([
        mainWindow.capturePage(),
        desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: targetPhysicalW, height: targetPhysicalH },
        }),
    ]);

    const appBuffer = appImg.toPNG();
    if (!appBuffer || appBuffer.length === 0) {
        debug && logger.log(`[detect] capturePage returned empty buffer, skipping check`);
        return { bypassed: false, avgDiff: 999, timeTakenMs: Date.now() - ts, error: 'appBuffer empty' };
    }
    const appMeta = await sharp(appBuffer).metadata();
    debug && logger.log(`[detect] App capture size: ${appMeta.width}x${appMeta.height}`);

    debug && logger.log(`[detect] desktopCapturer sources (${sources.length}):`);
    sources.forEach((s, i) => {
        debug && logger.log(`[detect]   [${i}] id=${s.id}, name=${s.name}, display_id=${s.display_id}, thumb=${s.thumbnail.getSize().width}x${s.thumbnail.getSize().height}`);
    });

    // Match source to the Electron display.
    // desktopCapturer exposes `display_id` on Electron >= 17 which maps directly to screen.getAllDisplays() id.
    let matchedSource = sources.find(s => String(s.display_id) === String(display.id));

    if (!matchedSource && sources.length > 1) {
        // Fallback: match by index in allDisplays
        const electronIndex = allDisplays.findIndex(d => d.id === display.id);
        if (electronIndex >= 0 && electronIndex < sources.length) {
        matchedSource = sources[electronIndex];
        debug && logger.log(`[detect] Fallback: matched by Electron display index ${electronIndex}`);
        }
    }

    if (!matchedSource) {
        // Last resort: use first source (single-display case)
        matchedSource = sources[0];
        debug && logger.log(`[detect] Could not match display, using first source`);
    }

    debug && logger.log(`[detect] Using source: id=${matchedSource.id}, name=${matchedSource.name}`);

    // Convert NativeImage thumbnail to PNG buffer
    const screenBuffer = matchedSource.thumbnail.toPNG();
    if (!screenBuffer || screenBuffer.length === 0) {
        debug && logger.log(`[detect] desktopCapturer thumbnail is empty, skipping check`);
        return { bypassed: false, avgDiff: 999, timeTakenMs: Date.now() - ts, error: 'screenBuffer empty' };
    }
    const screenMeta = await sharp(screenBuffer).metadata();
    debug && logger.log(`[detect] Screenshot size: ${screenMeta.width}x${screenMeta.height}`);

    // 4) Calculate Coordinates RELATIVE to the captured display
    const cropArea = {
        left: Math.round((content.x - display.bounds.x) * scale),
        top: Math.round((content.y - display.bounds.y) * scale),
        width: appMeta.width,
        height: appMeta.height
    };
    debug && logger.log(`[detect] Step 4: Raw crop area:`, cropArea);

    const clampedCrop = {
        left: Math.max(0, Math.min(cropArea.left, screenMeta.width - 1)),
        top: Math.max(0, Math.min(cropArea.top, screenMeta.height - 1)),
        width: Math.min(cropArea.width, screenMeta.width - Math.max(0, cropArea.left)),
        height: Math.min(cropArea.height, screenMeta.height - Math.max(0, cropArea.top))
    };
    debug && logger.log(`[detect] Clamped crop area:`, clampedCrop);

    // 5) Extract and Compare
    debug && logger.log(`[detect] Step 5: Extracting GDI region and comparing...`);
    const gdiBuffer = await sharp(screenBuffer).extract(clampedCrop).toBuffer();
    const gdiMeta = await sharp(gdiBuffer).metadata();
    debug && logger.log(`[detect] GDI crop result: ${gdiMeta.width}x${gdiMeta.height}`);

    const appRaw = await sharp(appBuffer)
        .removeAlpha()
        .resize(gdiMeta.width, gdiMeta.height)
        .raw()
        .toBuffer();

    const gdiRaw = await sharp(gdiBuffer)
        .removeAlpha()
        .raw()
        .toBuffer();

    debug && logger.log(`[detect] Buffer sizes: App=${appRaw.length} bytes, GDI=${gdiRaw.length} bytes`);

    // 6) Pixel Math
    if (appRaw.length !== gdiRaw.length) {
        console.error(`[detect] FATAL: Buffer lengths do not match!`);
        return { bypassed: false, avgDiff: 999, timeTakenMs: Date.now() - ts };
    }

    let totalDiff = 0;
    for (let i = 0; i < appRaw.length; i++) {
        totalDiff += Math.abs(appRaw[i] - gdiRaw[i]);
    }

    const avgDiff = totalDiff / appRaw.length;
    const isBypassed = avgDiff < 15;

    debug && logger.log(`[detect] Result: avgPixelDiff=${avgDiff.toFixed(2)}, bypassed=${isBypassed} (threshold=15)`);

    // 7) Save Debug Files
    try {
        if (debug) {
        fs.writeFileSync(path.join(debugDir, `${ts}_app.png`), appBuffer);
        fs.writeFileSync(path.join(debugDir, `${ts}_gdi.png`), gdiBuffer);
        fs.writeFileSync(path.join(debugDir, `${ts}_screen_full.png`), screenBuffer);
        debug && logger.log(`[detect] Debug images saved to: ${debugDir} (timestamp=${ts})`);
        }
    } catch (err) {
        console.error(`[detect] Failed to save debug images:`, err);
    }

    debug && logger.log(`[detect] === Check Complete ===\n`);
    return {
        bypassed: isBypassed,
        value: Number(avgDiff.toFixed(2)),
        count: sources.length,
        debug,
        timeTakenMs: Date.now() - ts,
        images: /** @type {const} */ Object.entries({ appBuffer, gdiBuffer, screenBuffer }).map(entry => {
            return new ImageBufferInfo(entry[1], { name: entry[0] });
        })
    };
};

async function getWindowsUSBDevices() {
    function parseWindowsUSBJSON(stdout) {
        try {
            const data = JSON.parse(stdout);
            const devices = Array.isArray(data) ? data : [data];
            return devices
                .filter(d => d.DeviceID && d.Description)
                .map(device => ({
                    deviceId: device.DeviceID,
                    description: device.Description,
                    vendor: extractVendorFromDeviceID(device.DeviceID),
                    product: extractProductFromDeviceID(device.DeviceID),
                }));
        } catch (error) {
            logger.warn('Failed to parse USB JSON:', error);
            return [];
        }
    }

    function detectVirtualUSBDevices(devices) {
        const virtualKeywords = ['VMware', 'VirtualBox', 'QEMU', 'Virtual', 'Emulated', 'Parallels', 'Hyper-V', 'KVM', 'Xen'];
        const virtualVendorIDs = ['0E0F', '80EE', '1B36', '045E'];
        return devices.filter(device => {
            const descMatch = virtualKeywords.some(k => device.description.toLowerCase().includes(k.toLowerCase()));
            const vendorMatch = device.vendor && virtualVendorIDs.some(vid => device.vendor.toUpperCase() === vid);
            return descMatch || vendorMatch;
        });
    }

    function parseWindowsUSBPiped(stdout) {
        return stdout
            .split('\n')
            .filter(line => line.trim() && line.includes('|'))
            .map(line => {
                const [deviceId, description] = line.split('|').map(s => s.trim());
                if (deviceId && description) {
                    return { deviceId, description, vendor: extractVendorFromDeviceID(deviceId), product: extractProductFromDeviceID(deviceId) };
                }
                return null;
            })
            .filter(d => d !== null);
    }

    function extractVendorFromDeviceID(deviceId) {
        const match = deviceId.match(/VID_([0-9A-F]{4})/i);
        return match ? match[1] : null;
    }

    function extractProductFromDeviceID(deviceId) {
        const match = deviceId.match(/PID_([0-9A-F]{4})/i);
        return match ? match[1] : null;
    }

    const commands = [
        'Get-CimInstance -ClassName Win32_USBHub | Select-Object DeviceID, Description | ConvertTo-Json',
        'Get-WmiObject Win32_USBHub | Select-Object DeviceID, Description | ConvertTo-Json',
    ];

    let obj = { commandsArr: [] };
    const startTime = Date.now();
    try {
        for (const command of commands) {
            let commandObj = { commandStr: command };
            obj.commandsArr.push(commandObj);
            try {
                const stdout = await runPowerShell({ script: command, timeout: 10000 });
                commandObj.rawOutput = stdout;
                const devices = command.includes('ConvertTo-Json') ? parseWindowsUSBJSON(stdout) : parseWindowsUSBPiped(stdout);
                if (devices && devices.length > 0) {
                    return {
                        ...obj,
                        timeTakenMs: Date.now() - startTime,
                        parsedOutput: devices,
                        virtualDevices: detectVirtualUSBDevices(devices),
                        totalCount: devices.length,
                    };
                }
            } catch (error) {
                console.log(`drive detection command failed: ${error.toString()}`);
                commandObj.error = { msg: error.message, trace: error.stack };
                continue;
            }
        }
        return { ...obj, error: { msg: 'All USB detection commands failed' }, timeTakenMs: Date.now() - startTime };
    } catch (error) {
        return { ...obj, error: { msg: error.toString(), trace: error.stack }, timeTakenMs: Date.now() - startTime };
    }
}

async function getUSBDevices() {
    const command =
        os.platform() === 'win32' ? 'wmic path CIM_LogicalDevice where "Description like \'USB%\'" get /value'
            : os.platform() === 'darwin' ? 'system_profiler SPUSBDataType'
                : 'lsusb';

    const [error, stdout] = await new Promise((resolve) => {
        exec(command, (error, stdout) => {
            if (error) { logger.error('Error fetching USB devices:', error); resolve([error, '']); return; }
            resolve(['', stdout]);
        });
    });
    if (error) throw new Error(error?.message ?? error);
    return stdout.split('\n').filter(line => line.trim());
}

async function getSecondaryMemoryInfo() {
    const command =
        os.platform() === 'win32' ? 'powershell.exe -Command "Get-PhysicalDisk"'
            : os.platform() === 'darwin' ? 'system_profiler SPDisplaysDataType'
                : 'lspci | grep -i vga';

    const [error, stdout] = await new Promise((resolve) => {
        exec(command, (error, stdout) => {
            if (error) { logger.error('Error fetching GPU info:', error); resolve([error, '']); return; }
            resolve(['', stdout]);
        });
    });
    return [error, stdout];
}

async function getWindowsGPU() {
    function detectVirtualGPUs(gpuList) {
        const virtualGpuKeywords = [
            'VirtualBox', 'VMware', 'SVGA', 'Microsoft Basic Display', 'Microsoft Hyper-V',
            'QEMU', 'QXL', 'UTM', 'Parallels', 'Xen', 'VirGL', 'virtio',
            'Cirrus Logic', 'Red Hat', 'Virtual Display', 'Standard VGA',
        ];
        return gpuList.filter(gpu => virtualGpuKeywords.some(k => gpu.toLowerCase().includes(k.toLowerCase())));
    }

    function parseWindowsGPU(stdout) {
        return stdout.split('\n').map(l => l.trim()).filter(l => l && !l.match(/^(Name|---)/i));
    }

    const commands = [
        'Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name',
        'Get-WmiObject Win32_VideoController | Select-Object -ExpandProperty Name',
        'wmic path win32_videocontroller get name',
    ];

    let obj = { commandsArr: [] };
    const startTime = Date.now();
    try {
        for (const command of commands) {
            let commandObj = { commandStr: command };
            try {
                obj.commandsArr.push(commandObj);
                const stdout = await runPowerShell({ script: command, timeout: 5000 });
                if (stdout && stdout.trim()) {
                    commandObj.rawOutput = stdout;
                    const out = parseWindowsGPU(stdout);
                    if (out && out.length) obj.virtualGPUs = detectVirtualGPUs(out);
                    obj.gpu = out;
                    obj.timeTakenMs = Date.now() - startTime;
                    return obj;
                }
            } catch (error) {
                commandObj.error = { msg: error.message, trace: error.stack };
                continue;
            }
        }
        return { ...obj, error: { msg: 'All GPU detection commands failed' }, timeTakenMs: Date.now() - startTime };
    } catch (error) {
        obj.error = { msg: error.toString(), trace: error.stack };
        obj.timeTakenMs = Date.now() - startTime;
        return obj;
    }
}

async function getGPUInfo() {
    if (os.platform() === 'win32') return getWindowsGPU();

    const command = os.platform() === 'darwin' ? 'system_profiler SPDisplaysDataType' : 'lspci | grep -i vga';
    let error = null;
    let stdout = '';
    try {
        stdout = await runPowerShell({
            script: command,
            name: "get GPU Info"
        })
    } catch (err) {
        logger.error('Error fetching GPU info:', error); resolve([error, ''])
        error = err;
    }
    if (error) throw new Error('getGPUInfo failed');

    const gpuList = stdout.split('\n').filter(line => line.trim());
    const virtualGpuKeywords = ['VirtualBox', 'VMware', 'Microsoft Basic Display Adapter', 'QEMU', 'UTM', 'Parallels', 'Xen', 'VirGL', 'GFX'];
    const detectedGPUs = gpuList.filter(gpu => virtualGpuKeywords.some(k => gpu.toLowerCase().includes(k.toLowerCase())));
    return [detectedGPUs, stdout];
}

async function getNetworkInterfacesDetails() {
    const startTime = Date.now();
    let out = {};
    try {
        const ps = `
$result = @{ ok = $false; reason = $null; adapter = $null }
try {
  $idx = (Get-NetRoute -DestinationPrefix "0.0.0.0/0" -AddressFamily IPv4 | Sort-Object RouteMetric, InterfaceMetric | Select-Object -First 1).InterfaceIndex
  if (-not $idx) { throw "NO_DEFAULT_ROUTE" }
  $ad  = Get-NetAdapter -InterfaceIndex $idx -ErrorAction Stop
  $cfg = Get-NetIPConfiguration -InterfaceIndex $idx -ErrorAction Stop
  $result.ok = $true
  $result.adapter = @{
    ifIndex     = $idx; name = $ad.Name; status = $ad.Status
    description = $ad.InterfaceDescription; mac = $ad.MacAddress
    linkSpeed   = ($ad.LinkSpeed.ToString()); isPhysical = $ad.HardwareInterface
    ipv4        = @($cfg.IPv4Address | Select-Object -ExpandProperty IPv4Address)
    gatewayV4   = ($cfg.IPv4DefaultGateway | Select-Object -ExpandProperty NextHop -First 1)
    dnsServers  = @($cfg.DnsServer.ServerAddresses)
  }
} catch { $result.reason = $_.Exception.Message }
$result | ConvertTo-Json -Depth 6`;

        out.allNetworkInterfaces = await runPowerShell({ script: `getmac /v /fo csv`, name: 'getmac' });
        const activeMacRaw = await runPowerShell({ script: ps });
        out.activeMacRaw = activeMacRaw;
        out.activeMacNetwork = JSON.parse(activeMacRaw);
        return { ...out, timeTakenMs: Date.now() - startTime };
    } catch (error) {
        return { ...out, error: { msg: error.toString(), trace: error.stack }, timeTakenMs: Date.now() - startTime };
    }
}

async function checkUSBDevices() {
    if (os.platform() === 'win32') {
        try {
            return await getWindowsUSBDevices();
        } catch (error) {
            return { error: { msg: error.message, trace: error.stack } };
        }
    }

    let out = {};
    const startTime = Date.now();
    try {
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        const { stdout } = await execAsync('wmic path Win32_USBHub get DeviceID,Description');
        const lines = stdout.split('\n').filter(line => line.trim());
        const usbDeviceCount = lines.length - 1;
        return { ...out, stdout, deviceCount: usbDeviceCount, isVirtual: usbDeviceCount === 0, timeTakenMs: Date.now() - startTime };
    } catch (error) {
        return { ...out, usbError: { msg: error?.message, trace: error?.stack }, timeTakenMs: Date.now() - startTime };
    }
}

const getExePath = async () => {
    return app.getPath('exe');
    // try {
    //     const execAddon = require('exec-addon');
    //     logger.log('Require Passed for the detection');
    //     const encodedPayload = await utils.encodePayload({ timestamp: Date.now() }, config.nodeAddonKeys.sharedTx);
    //     let payloadB64 = encodedPayload.payload;
    //     if (Buffer.isBuffer(payloadB64)) {
    //         payloadB64 = payloadB64.toString('base64');
    //     } else if (typeof payloadB64 === 'object') {
    //         payloadB64 = Buffer.from(JSON.stringify(payloadB64)).toString('base64');
    //     } else {
    //         payloadB64 = String(payloadB64);
    //     }
    //     const isActive = await execAddon.UnLock({ pub: config.eApiKey, data: payloadB64 });
    //     if (!isActive) throw new Error('Something went wrong');
    //     return await execAddon.getExecPath();
    // } catch (error) {
    //     return { message: 'Get Exec Path addon failed', error: error?.message ?? error };
    // }
};

async function getSMBIOSSerial() {
    function parseWindowsBIOSSerial(stdout) {
        return stdout.split('\n').map(l => l.trim()).filter(l => l && !l.match(/^(SerialNumber|---)/i)).find(l => l.length > 0) || '';
    }

    function isVirtualBIOSSerial(serial) {
        const patterns = [/VMware/i, /VirtualBox/i, /QEMU/i, /Xen/i, /Parallels/i, /Microsoft.*Virtual/i, /^0+$/, /^[Ff]+$/, /Virtual Machine/i, /VMWARE/, /VBOX/, /KVM/i];
        return patterns.some(p => p.test(serial));
    }

    const commands = [
        'Get-CimInstance -ClassName Win32_BIOS | Select-Object -ExpandProperty SerialNumber',
        'Get-WmiObject Win32_BIOS | Select-Object -ExpandProperty SerialNumber',
        'wmic bios get serialnumber',
        '(Get-WmiObject -Class Win32_BIOS).SerialNumber',
    ];

    let obj = { commandsArr: [] };
    const startTime = Date.now();
    try {
        for (const command of commands) {
            let commandObj = { commandStr: command };
            try {
                obj.commandsArr.push(commandObj);
                const stdout = await runPowerShell({ script: command, timeout: 5000 });
                if (stdout && stdout.trim()) {
                    commandObj.rawOutput = stdout;
                    const serial = parseWindowsBIOSSerial(stdout);
                    commandObj.parsedOutput = serial;
                    if (serial) {
                        obj.serial = serial;
                        obj.isVirtual = isVirtualBIOSSerial(serial);
                        obj.timeTakenMs = Date.now() - startTime;
                        return obj;
                    }
                }
            } catch (error) {
                commandObj.error = { msg: error.message, trace: error.stack };
                continue;
            }
        }
        return { ...obj, error: { msg: 'All SMBIOS Serial detection commands failed' }, timeTakenMs: Date.now() - startTime };
    } catch (error) {
        obj.error = { msg: error.toString(), trace: error.stack };
        obj.timeTakenMs = Date.now() - startTime;
        return obj;
    }
}

/** @returns {{ validator: string; isVM: boolean; brand: string; type: string; percentage: number }} */
function aesGcmDecrypt(base64Bundle, keySeed) {
    const key = crypto.createHash('sha256').update(keySeed).digest();
    const bundle = Buffer.from(base64Bundle, 'base64');
    const nonce = bundle.subarray(0, 12);
    const ciphertext = bundle.subarray(12, bundle.length - 16);
    const tag = bundle.subarray(bundle.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);

    const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(dec.toString('utf8'));
}

/** @returns {Promise<{ code: number; stdout: string; stderr: string; error: import('child_process').ExecFileException | null }>} */
async function runVmDetectExe(challenge) {
    return new Promise((resolve, reject) => {
        execFile(pathToVMExecutable, [process.pid, challenge], { timeout: 15000, windowsHide: true }, (error, stdout, stderr) => {
            const out = String(stdout || '').trim();
            const err = String(stderr || '').trim();
            if (error && error.code === undefined) return reject(error);
            resolve({ code: error?.code ?? 0, stdout: out, stderr: err, error });
        });
    });
}

/** @param {string} input */
function hashChallenge(input) {
    const FNV_OFFSET_BASIS = 1469598103934665603n;
    const FNV_PRIME = 1099511628211n;
    let hash = FNV_OFFSET_BASIS;
    for (const b of Buffer.from(input, 'utf8')) {
        hash ^= BigInt(b);
        hash = BigInt.asUintN(64, hash * FNV_PRIME);
    }
    return hash.toString(16);
}

async function detectVMUsingExe() {
    const challenge = performance.now().toString();
    const hashedChallenge = hashChallenge(challenge);
    const keySeed = VM_DETECT_SECRET + hashedChallenge;

    const result = await runVmDetectExe(challenge);

    if (!result.stdout) {
        throw new Error(`VM Detect Exe failed with code ${result.code}, stderr: ${result.stderr}, error: ${JSON.stringify(result.error)}`);
    }

    const data = aesGcmDecrypt(result.stdout, keySeed);

    if (data.validator !== hashedChallenge) {
        throw new Error('Hash mismatch. Possible tampering detected.');
    }

    return data;
}

const detectVMWindows = async (vmClassificationConfig = {}) => {
    let parsedResponse = {};
    let exeError;
    try {
        parsedResponse = await detectVMUsingExe();
    } catch (error) {
        console.log('Error VM Detection:', error.toString());
        exeError = { msg: error.toString(), trace: error.stack };
    }
    parsedResponse.log = await detectVMWindowsLogger(vmClassificationConfig);
    if (exeError) parsedResponse.log.exeError = exeError;
    try {
        return utils.encodePayload(parsedResponse);
    } catch (error) {
        console.error(error?.message ?? error);
        return {
            payload: { error: { msg: error.toString(), trace: error.stack } }
        };
    }
};

const detectVMWindowsLogger = async (vmClassificationConfig = {}) => {
    try {
        let log = '';
        let response = {};
        let logsOfCommands = '';
        let isVM = false;
        const { collectMoreInfo } = vmClassificationConfig;
        const isPWSAvailable = await isPowerShellAvailable();

        if(isPWSAvailable){
            const command = `Get-CimInstance Win32_ComputerSystemProduct | select Name`;
            logsOfCommands += 'Exec Platform Name Check: \n';
            let error = null;
            let platformNameOutput = '';

            try {
                const result = await runPowerShell({
                    script: command,
                    name: 'Platform Name Check'
                });
                platformNameOutput = result?.toLowerCase() || '';
            } catch (err) {
                error = err;
            }
            if (error) {
                logsOfCommands += `Command Failed with error: ${error}`;
            }
            logsOfCommands += `\nCommand Output: ${platformNameOutput}`;
            if (!error) {
                for (const vm of VMs) {
                    isVM = platformNameOutput.includes(vm);
                    if (isVM) { logsOfCommands += `VM Detected by platform name: ${vm}`; break; }
                }
            }
            if (collectMoreInfo) {
                try {
                    let vmByGPU = false;
                    logsOfCommands += `\n\nDetecting GPU: `;
                    const gpuDetails = await getGPUInfo();
                    const { gpu } = gpuDetails;
                    response.gpuDetails = gpuDetails;
                    if (gpu) {
                        if (gpu.some(g => /VirtualBox|VMware/i.test(g))) vmByGPU = true;
                        logsOfCommands +=   `\nGPU Detection Output: ${gpu}`;
                        logsOfCommands += `\nResult: ${vmByGPU}\n\n`;
                    }
                } catch (error) {
                    response.gpuDetails = { error: { msg: error.toString(), trace: error.stack } };
                    logsOfCommands += `\nError while detecting gpu: ` + error?.message;
                }
            }

            if (collectMoreInfo) {
                try {
                    logsOfCommands += `Detecting USB: `;
                    response.usbDevices = await checkUSBDevices();
                } catch (error) {
                    response.usbDevices = { error: { msg: error.toString(), trace: error.stack } };
                }
            }

            if (collectMoreInfo) {
                try {
                    logsOfCommands += `Detecting SMBIOS: `;
                    response.smbios = await getSMBIOSSerial();
                } catch (error) {
                    response.smbios = { error: { msg: error.toString(), trace: error.stack } };
                }
            }

            if (collectMoreInfo) {
                try {
                    const networkDetails = await getNetworkInterfacesDetails();
                    response.activeNetworkInterfaces = networkDetails || {};
                    const { activeMacNetwork } = networkDetails;
                    logsOfCommands += `\n\nRunning VM Check through active mac address.\n`;
                    if (activeMacNetwork?.ok && activeMacNetwork?.adapter?.mac) {
                        const res = matchMacVendor(activeMacNetwork.adapter.mac, invalidMacAddressesMap);
                        networkDetails.isVM = res;
                        logsOfCommands += `\nResult: ${res}`;
                    }
                } catch (error) {
                    response.activeNetworkInterfaces = { error: { msg: error.toString(), trace: error.stack } };
                }
            }
        } else{
            const errObj = {
                msg: "PowerShell not available",
                trace: ""
            };

            logsOfCommands += '\nPowerShell not available. Skipping all checks.\n';

            response.gpuDetails = { error: errObj };

            response.usbDevices = { error: errObj };

            response.smbios = { error: errObj };

            response.activeNetworkInterfaces = { error: errObj };
        }

        logsOfCommands += `\n\nSecondary Memory\n`;
        const [errSecondaryMemory, secondaryMemoryOut] = await getSecondaryMemoryInfo();
        logsOfCommands += errSecondaryMemory ? errSecondaryMemory?.message ?? errSecondaryMemory : secondaryMemoryOut;

        logsOfCommands += `\n\nCPU Details\n`;
        logsOfCommands += JSON.stringify(os.cpus());

        logsOfCommands += `\n\n\nSystemInfo\n`;
        const [errSystemInfo, systemInfoOut] = await new Promise((resolve) => {
            try {
                exec('systeminfo', (err, result) => {
                    if (err) return resolve([err, '']);
                    return resolve(['', result]);
                });
            } catch (error) {
                resolve([error, '']);
            }
        });
        if (errSystemInfo) logsOfCommands += `Error while checking systemInfo: ${errSystemInfo}`;
        logsOfCommands += `Stdout: ${systemInfoOut}`;

        return {
            isVM,
            logs: log + logsOfCommands,
            activeNetworkInterfaces: response.activeNetworkInterfaces,
            gpuDetails: response.gpuDetails,
            usbDevices: response.usbDevices,
            smbios: response.smbios,
        };
    } catch (error) {
        console.error(error);
        return { isVM: false, logs: error?.message ?? error };
    }
};

const detectVMLinux = async () => {
    return new Promise((resolve) => {
        exec('echo -n "product_name: "; cat /sys/devices/virtual/dmi/id/product_name 2>/dev/null; echo;', (err, result) => {
            if (err) return resolve({ isVM: false, logs: err });
            const name = (result.toString()?.split(':')?.[1] ?? '').trim().replaceAll('\n', '').toLowerCase();
            logger.log(`Platform Name: ${name}`);
            resolve({ isVM: VMs.includes(name), logs: result });
        });
    });
};

const detectVMMacOsLogger = async () => {
    return new Promise(async (resolve, reject) => {
        try {
            let logsOfCommands = "";
            let log = "";
            const tryAll = true;
            let isVM = await new Promise((resolve, reject) => {
                exec("system_profiler SPHardwareDataType", (err, result) => {
                    logsOfCommands += `\n\nCommand Used: system_profiler SPHardwareDataType\n`;
                    if (err) {
                        logsOfCommands += '\n\nError In Command system_profiler SPHardwareDataType | grep -i virtual: ' + err;
                    }
                    const isVM = (result?.includes('virtual')) ?? false;
                    logsOfCommands += `\noutput: ${result}`;
                    logsOfCommands += `\nResult:  ${isVM ? 'true' : 'false'}\n\n`
                    resolve(isVM);
                });
            });
            const macAddresses = [];
            const networkInterface = os.networkInterfaces();
            Object.entries(networkInterface).forEach(([key, int]) => {
                int.forEach((interfaceInfo) => {
                    macAddresses.push(interfaceInfo.mac);
                })
            });

            if (!isVM || tryAll) {
                try {
                    let vmByGPU = false;
                    logsOfCommands += `\n\n\nDetecting GPU:\n`
                    const [gpuInfo, rowInfo] = await getGPUInfo();
                    if (gpuInfo.some((gpu) => /VirtualBox|VMware/i.test(gpu))) {
                        vmByGPU = true;
                    }
                    logsOfCommands += `\nGPU Detection Output: ${rowInfo}`;
                    isVM = isVM || vmByGPU;
                    logsOfCommands += `\nResult:  ${vmByGPU ? 'true' : 'false'}\n\n`
                } catch (error) {
                    logsOfCommands += `\nError while detecting gpu: ` + error?.message ?? error;
                }
            }

            if (!isVM || tryAll) {
                try {
                    logsOfCommands += `Detecting USB: `
                    const usbDevices = await getUSBDevices();
                    if (usbDevices.length === 0) {
                        isVM = true;
                        logsOfCommands += `No USB Devices found`;
                    }
                    logsOfCommands += `\nUSB Detection Output: ${JSON.stringify(usbDevices)}\n`;
                    logsOfCommands += `\nResult:  ${JSON.stringify(usbDevices ?? '')}\n\n`
                } catch (error) {
                    logsOfCommands += `\nError while detecting usb: ` + error?.message ?? error;
                }
            }

            if (!isVM || tryAll) {
                logsOfCommands += `\n\nRunning VM Check through mac address\n`;
                isVM = macAddresses.reduce((result, current) => {
                    let currentResult = false;
                    if (current) {
                        const prefix = current.split(':').filter((_, index) => index < 3).join(':').toUpperCase();
                        if (invalidMacAddressesMap.has(prefix)) {
                            currentResult = true;
                            logsOfCommands += `MAC Address match found: ${invalidMacAddressesMap.get(prefix)}`
                        }
                    }
                    return result || currentResult;
                }, false);
            }

            if (!isVM || tryAll) {
                const totalMemory = os.totalmem();
                if (totalMemory < minimumRequiredMemory) {
                    isVM = true;
                    logsOfCommands += `Memory Present ${totalMemory} required ${minimumRequiredMemory}`;
                }
            }

            if (isVM) {
                await new Promise((resolve, reject) => {
                    exec('system_profiler', {
                        maxBuffer: 10000000000000,
                    }, (err, result) => {
                        log += "\n\nResult Of System Profiler:\n\n";
                        log += result;
                        resolve();
                    })
                });
            }
            return resolve({
                isVM: isVM,
                logs: log + logsOfCommands,
            });
        } catch (error) {
            console.error(error);
            resolve({
                isVM: false,
                logs: error?.message ?? error,
            });
        }
    })
}

const detectMacOs = async () => {
    let parsedResponse = {};
    let exeError;
    try {
        parsedResponse = await detectVMUsingExe();
    } catch (error) {
        console.log('Error VM Detection:', error.toString());
        exeError = { msg: error.toString(), trace: error.stack };
    }
    parsedResponse.log = await detectVMMacOsLogger();
    if (exeError) parsedResponse.log.exeError = exeError;
    try {
        return utils.encodePayload(parsedResponse);
    } catch (error) {
        console.error(error?.message ?? error);
        return { error: { msg: error.toString(), trace: error.stack } };
    }
};

const checkIfVM = ({ vmClassificationConfig = {} }) => {
    switch (os.platform()) {
        case 'win32': return detectVMWindows(vmClassificationConfig);
        case 'linux': return detectVMLinux();
        case 'darwin': return detectMacOs();
    }
    return false;
};

const checkForDeskSpace = (location) => checkDiskSpace(location);

async function getCheckSum(targetPath) {
    const options = {};
    if (os.platform() === 'darwin') {
        options.files = { exclude: ['CodeResources'] };
        options.folders = { exclude: ['Frameworks', '_CodeSignature'] };
    }
    if (os.platform() === 'win32') {
        options.files = { exclude: ['elevate.exe', 'Uninstall Testpad.exe', 'Uninstall CQ TestApp.exe', 'app-update.yml', 'CQ TestApp.exe', 'Testpad.exe'] };
    }

    let result = {};
    try {
        result = await folderHashInline(targetPath, options);
    } catch (error) {
        result.error = { message: 'checksum failed', error: error?.message ?? error };
    }

    if (os.platform() === 'win32') result.platform = 'win';
    if (os.platform() === 'darwin' && os.arch() === 'arm64') result.platform = 'darwin-arm';
    if (os.platform() === 'darwin' && os.arch() === 'x64') result.platform = 'darwin-intel';

    return result;
}

module.exports = {
    ExecCommand,
    checkForDeskSpace,
    checkIfVM,
    getCheckSum,
    getExePath,
};

//--FILE-SEPARATOR--

const crypto = require('crypto');
const fs = require('fs');
const zod = require('zod');
const { app } = require('electron');
const config = require('../config/config');

function sanitizeEarlyOrExit() {
    console.log(process.argv);
    const bannedArg = (a) => a.startsWith("--inspect") || a.startsWith("--remote-debugging-port");
    if (process.argv.some(bannedArg)) {
        try { dialog.showErrorBox("Blocked", "Debugger flags are not allowed."); } catch {}
        process.exit(1);
    }

    const bannedEnv = [
        "NODE_OPTIONS", "ELECTRON_ENABLE_LOGGING", "ELECTRON_RUN_AS_NODE",
        process.platform === "darwin" ? "DYLD_INSERT_LIBRARIES" : "",
        process.platform === "linux" ? "LD_PRELOAD" : ""
    ].filter(Boolean);

    const hit = bannedEnv.filter(k => process.env[k]);
    if (hit.length) {
        try { dialog.showErrorBox("Blocked", `Prohibited environment detected: ${hit.join(", ")}`); } catch {}
        process.exit(1);
    }

    app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
    app.commandLine.appendSwitch("no-proxy-server");

    delete process.env.NODE_OPTIONS;
    delete process.env.ELECTRON_ENABLE_LOGGING;
}

/**
 * Create SHA-256 of a file
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function createSHA(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.once('error', reject);
        hash.once('error', reject);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

async function checkIntegrityOfExe(path, sha) {
    try {    
        const calculatedSha = await createSHA(path);
        console.log("GOT: ", calculatedSha, "REQUIRED: ", sha);
        return calculatedSha === sha;
    } catch (error) {
        return false;
    }
}

const processKillServiceConfig = zod.object({
    status: zod.boolean().default(false),
    exceptionQuizzes: zod.array(zod.string()).default([]),
}).default({});

const ServerConfigSchema = zod.object({
    stopAiProctoring: zod.preprocess(arg => arg === '1', zod.boolean().default(false)),
    stopRecording: zod.preprocess(arg => arg === '1', zod.boolean().default(false)),
    encryptionConfig: processKillServiceConfig.default({
        status: true,
        exceptionQuizzes: [],
    }),
    blurTimeoutInterval: zod.coerce.number().default(2000),
    darwin: zod.object({
        disableStrictCheck: zod.boolean().default(false),
        processKillServiceConfig,
    }).default({ disableStrictCheck: false, processKillServiceConfig: { status: false, exceptionQuizzes: [] } }),
    win32: zod.object({
        disableStrictCheck: zod.boolean().default(false),
        multipleWindowDetectionType: zod.number().default(0),
        processKillServiceConfig,
    }).default({ disableStrictCheck: false, processKillServiceConfig: { status: false, exceptionQuizzes: [] } }),
    vmClassificationConfig: zod.object({
        status: zod.boolean().default(false),
        exceptionQuizzes: zod.array(zod.string()).default([]),
    }).default({ status: false, exceptionQuizzes: [] }),
    contentProtectionConfig: zod.object({
        status: zod.boolean().default(false),
        logout: zod.boolean().default(false),
        exceptionQuizzes: zod.array(zod.string()).default([]),
    }).default({ status: false, logout: false, exceptionQuizzes: [] }),
    processDetection: zod.object({
        status: zod.boolean().default(true),
        exceptionQuizzes: zod.array(zod.string()).default([])
    }).default({ status: true, exceptionQuizzes: [] }),
    overlayDetection: zod.object({
        status: zod.boolean().default(true),
        exceptionQuizzes: zod.array(zod.string()).default([])
    }).default({ status: true, exceptionQuizzes: [] }),
    screenTemperingDetection: zod.object({
        status: zod.boolean().default(true),
        debug: zod.boolean().default(false),
        exceptionQuizzes: zod.array(zod.string()).default([])
    }).default({ status: false, debug: false, exceptionQuizzes: [] })
}).default({
    win32: { disableStrictCheck: false },
    darwin: { disableStrictCheck: false, processKillServiceConfig: { status: true, exceptionQuizzes: [] } },
    stopAiProctoring: false,
    stopRecording: false,
    encryptionConfig: { status: true, exceptionQuizzes: [] },
    blurTimeoutInterval: 2000,
    vmClassificationConfig: { status: true, exceptionQuizzes: [] },
    contentProtectionConfig: { status: false, logout: false, exceptionQuizzes: [] },
    processDetection: { status: true, exceptionQuizzes: [] },
    overlayDetection: { status: true, exceptionQuizzes: [] },
    screenTemperingDetection: { status: true, debug: false, exceptionQuizzes: [] },
});

const defaultServerConfig = ServerConfigSchema.parse({});

/** @typedef {zod.infer<typeof ServerConfigSchema>} ServerConfig  */

const getConfigFromServer = async () => {
    try {
        const url = new URL("/app/config", config.QUIZ_SERVER).toString();
        console.log("USING URL: ", url.toString());
        const rowResponse = await fetch(url.toString());
        if (!rowResponse.ok) {
            throw new Error("Error getting config from server using default config");
        }
        const response = await rowResponse.json();
        const configFromServer = response ?? {};
        const safeParse = ServerConfigSchema.safeParse(configFromServer);
        if (!safeParse.success) {
            console.error("Invalid config format:", safeParse.error);
            throw new Error('Invalid config for the server');
        }
        return safeParse.data;
    } catch (error) {
        console.error(error);
        const res = ServerConfigSchema.safeParse({});
        return res.data;
    }
}

module.exports = {
    defaultServerConfig,
    sanitizeEarlyOrExit,
    checkIntegrityOfExe,
    getConfigFromServer,
}

//--FILE-SEPARATOR--

const { app, BrowserWindow, dialog } = require('electron');
const { execSync } = require('child_process');

function isWindows() {
  return process.platform === 'win32';
}

function isProcessElevated() {
  if (!isWindows()) return false;

  try {
    const cmd =
      'powershell -NoProfile -NonInteractive -Command ' +
      '"(New-Object Security.Principal.WindowsPrincipal(' +
      '[Security.Principal.WindowsIdentity]::GetCurrent()))' +
      '.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"';

    const output = execSync(cmd, { encoding: 'utf8' }).trim();
    return output.toLowerCase() === 'true';
  } catch (err) {
    console.error('isProcessElevated failed:', err.message);
    return false;
  }
}

// -----------------------------------------
// 2) Get admin users & membership info
// -----------------------------------------
function getAdminUsers() {
  if (!isWindows()) return [];

  try {
    const psScript =
      "$admins = Get-LocalGroupMember -Group 'Administrators' " +
      "| Where-Object { $_.ObjectClass -eq 'User' }; " +
      "$admins | Select-Object Name,ObjectClass | ConvertTo-Json -Compress";

    const output = execSync(
      `powershell -NoProfile -NonInteractive -Command "${psScript}"`,
      { encoding: 'utf8' }
    ).trim();

    if (!output) {
      return [];
    }

    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch (e) {
      console.error('getAdminUsers JSON parse failed:', e.message, 'raw:', output);
      return [];
    }

    const list = Array.isArray(parsed) ? parsed : [parsed];
    const names = list.map((a) => a.Name);
    return names; // e.g. ["DESKTOP-12345\\Asus user", ".\\Administrator"]
  } catch (err) {
    console.error('getAdminUsers failed:', err.message);
    return [];
  }
}

function getCurrentUserMatchesInAdmins() {
  const admins = getAdminUsers();
  const current = process.env.USERNAME;

  if (!current || admins.length === 0) {
    return { currentMatches: [], otherAdmins: admins, admins };
  }

  const lowerCurrent = current.toLowerCase();

  const currentMatches = admins.filter((name) =>
    name.toLowerCase().includes(lowerCurrent)
  );
  const otherAdmins = admins.filter((name) => !currentMatches.includes(name));

  console.log('Admin users detected:', admins);
  console.log('Current user:', current);
  console.log('Current matches:', currentMatches);
  console.log('Other admins:', otherAdmins);

  return { currentMatches, otherAdmins, admins };
}

function isCurrentUserAdminUser() {
  const { currentMatches } = getCurrentUserMatchesInAdmins();
  return currentMatches.length > 0;
}

function isCurrentUserOnlyAdmin() {
  const { currentMatches, otherAdmins } = getCurrentUserMatchesInAdmins();
  return currentMatches.length > 0 && otherAdmins.length === 0;
}

// -----------------------------------------
// 3) Read UAC policy (to distinguish explicit vs "always admin")
// -----------------------------------------
function getUacPolicy() {
  if (!isWindows()) return null;

  try {
    const psScript =
      "$p = Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System';" +
      "$obj = [PSCustomObject]@{ EnableLUA = $p.EnableLUA; ConsentPromptBehaviorAdmin = $p.ConsentPromptBehaviorAdmin };" +
      '$obj | ConvertTo-Json -Compress';

    const output = execSync(
      `powershell -NoProfile -NonInteractive -Command "${psScript}"`,
      { encoding: 'utf8' }
    ).trim();

    if (!output) return null;

    const parsed = JSON.parse(output);
    return {
      EnableLUA: parsed.EnableLUA,
      ConsentPromptBehaviorAdmin: parsed.ConsentPromptBehaviorAdmin,
    };
  } catch (err) {
    console.error('getUacPolicy failed:', err.message);
    return null;
  }
}

function classifyElevationScenario() {
  if (!isWindows()) return 'notElevated';
    
  const elevated = isProcessElevated();
  if (!elevated) return 'notElevated';

  const isAdminUser = isCurrentUserAdminUser();
  if (!isAdminUser) {
    // Non-admin but elevated (runas / service / weird case) → treat as explicit.
    return 'explicitElevation';
  }

  const policy = getUacPolicy();
  if (!policy || typeof policy.EnableLUA !== 'number') {
    // If we can't read policy, safest assumption: explicit elevation
    return 'explicitElevation';
  }

  // Key rule:
  // - EnableLUA = 0 → UAC completely disabled → all admin processes run fully elevated
  //   => user CANNOT "just run normally" as long as they are admin.
  if (policy.EnableLUA === 0) {
    return 'alwaysElevated';
  }

  // Otherwise (UAC enabled) we assume:
  // - Normal launches are non-elevated
  // - Current one is elevated because they did something explicit
  return 'explicitElevation';
}

function checkElevation() {
    try {
        
    
  const scenario = classifyElevationScenario();
const username = process.env.USERNAME || 'your-user';
  if (scenario === 'explicitElevation') {
  dialog.showMessageBoxSync({
    type: 'warning',
    title: 'Do not run this app as Administrator',
    message:
      'This exam application is currently running with Administrator privileges, which is not allowed.',
    detail:
      'Please close the app and run it normally.\n\n' +
      'Do NOT use “Run as administrator”.\n\n' +
      'If Windows is forcing the app to run as administrator automatically, ' +
      'please remove the Compatibility flag:\n\n' +
      'How to remove “Run as administrator” in Compatibility settings:\n' +
      '1. Right-click the application icon or shortcut.\n' +
      '2. Select “Properties”.\n' +
      '3. Go to the “Compatibility” tab.\n' +
      '4. Under “Settings”, UNCHECK:\n' +
      '      ✔ Run this program as an administrator\n' +
      '5. Click “Apply” → “OK”.\n' +
      '6. Close this app and reopen it normally.\n',
    buttons: ['Exit'],
    defaultId: 0,
  });

  app.quit();
  return;
}

  // scenario === 'alwaysElevated'
  // System is effectively always running this admin user elevated
  const onlyAdmin = isCurrentUserOnlyAdmin();

  let detailMessage;
  if (onlyAdmin) {
    // They are the only admin on this device → do NOT tell them to delete themselves from Administrators
    detailMessage =
      'This exam application has detected that it is running with Administrator privileges.\n\n' +
      'Your Windows account appears to be the ONLY administrator account on this device.\n\n' +
      'In this configuration, your account always runs with full administrative rights, ' +
      'and the app cannot run with standard user permissions.\n\n' +
      '⚠️ Do NOT remove your account from the Administrators group yourself — ' +
      'you may lose all administrative access to this PC.\n\n' +
      'Please contact your IT support team or system administrator and ask them to:\n' +
      '• Create a separate standard (non-admin) user account for exams, OR\n' +
      '• Reconfigure this device so this app can run as a standard user.';
  } else {
    // They are an admin, but there is at least one other admin account
    detailMessage =
      'This exam application has detected that it is running with Administrator privileges, ' +
      'and your system appears to be configured so that your admin account always runs elevated.\n\n' +
      'To allow the app to run as a standard user, you can convert this account into a ' +
      'standard (non-admin) account:\n\n' +
      '1. Close this application.\n' +
      '2. Log in with another administrator account on this device.\n' +
      '3. Open **Command Prompt as Administrator**.\n' +
      '4. Run the following command:\n\n' +
      `   net localgroup Administrators "${username}" /delete\n\n` +
      '5. Restart your computer.\n' +
      '6. Log in again with this account and run the exam app normally.\n\n' +
      '⚠️ This command removes your account from the Administrators group.\n' +
      'Make sure there is at least one other administrator account on this device before doing this.';
  }

  dialog.showMessageBoxSync({
    type: 'warning',
    title: 'Administrative privileges are not allowed',
    message:
      'Please run this exam application with a standard (non-admin) Windows account.',
    detail: detailMessage,
    buttons: ['Exit'],
    defaultId: 0,
  });

  app.quit();
} catch (error) {
       console.error('checkElevation failed:', error);

    }
}


module.exports = {
    checkElevation,
    classifyElevationScenario,
};

//--FILE-SEPARATOR--

// deviceSecret.ts
const crypto = require('crypto');
const { machineIdSync } = require('node-machine-id');

const getDeviceSecret = async function () {
    try {
        // Stable machine identifier (already hashed if true)
        const machineId = machineIdSync(true); // true → returns hashed machine ID string
        console.log("Machine ID:", machineId);
        // Derive machine-bound secret
        const deviceSecret = crypto
            .createHash('sha256')
            .update(machineId, 'utf8')
            .digest(); // 32 bytes
        return deviceSecret?.toString('hex') ?? null;

    } catch (error) {
        console.error("Error getting device secret:", error);
        return null;
    }
}

module.exports = { getDeviceSecret };

//--FILE-SEPARATOR--

// @ts-check
/// <reference path="./ipc-process-client.h.ts" />

"use strict";

const { spawn } = require("child_process");
const { EventEmitter } = require("events");
const path = require("path");

// ─── IpcProcessClient ─────────────────────────────────────────────────────────
// Generic transport: spawns a process, reads length-prefixed JSON frames,
// emits typed 'message', 'error', 'close' events.
// Reusable for any exe that speaks the same uint32_t-prefixed JSON protocol.

/** @template {IpcMessageEventType} T */
class IpcProcessClient {

	static DEFAULT_HEADER_SIZE = /** @type {const} */ (4);

	/** @type {EventEmitter<IpcProcessClientMap<T>>} */
	#eventEmitter = new EventEmitter;

	/** @type {import('child_process').ChildProcess | null} */
	#child = null;

	/** @type {string} */
	#exePath;

	/** @type {"throw" | "ignore" | "restart"} */
	#ifRunning;

	/** @param {IpcProcessClientOptions} options */
	constructor(options) {
		this.on = this.#eventEmitter.on.bind(this.#eventEmitter);
		this.off = this.#eventEmitter.off.bind(this.#eventEmitter);
		this.once = this.#eventEmitter.once.bind(this.#eventEmitter);
		this.#exePath = options.exePath;
		this.#ifRunning = options.ifRunning ?? "throw";
	}

	/**
	 * Spawns the exe with the given CLI arguments and begins reading IPC frames.
	 * @param {string[]} args
	 * @returns {this}
	 */
	start(args) {
		if (this.#child !== null) {
			switch (this.#ifRunning) {
				case "ignore": return this;
				case "restart": this.stop(); break;
				default: throw new Error("IpcProcessClient is already running. Call stop() first.");
			}
		}

		const child = spawn(this.#exePath, args, { stdio: ["ignore", "pipe", "pipe"] });
		this.#child = child;

		child.stdout.on("data", this.#makeFrameReader());

		let stderrBuf = "";
		child.stderr.on("data", /** @param {Buffer} chunk */ (chunk) => {
			stderrBuf += chunk.toString();
			let nl;
			while ((nl = stderrBuf.indexOf("\n")) !== -1) {
				const line = stderrBuf.slice(0, nl).trim();
				stderrBuf = stderrBuf.slice(nl + 1);
				if (line) this.#eventEmitter.emit("error", new Error(line));
			}
		});
		child.stderr.on("end", () => {
			const line = stderrBuf.trim();
			if (line) this.#eventEmitter.emit("error", new Error(line));
		});

		child.on("error", (err) => {
			this.#eventEmitter.emit("error", err);
		});

		child.on("close", (code) => {
			this.#child = null;
			this.#eventEmitter.emit("close", code);
		});

		process.on("SIGINT", () => this.stop());

		return this;
	}

	/** Sends SIGINT to the child process. */
	stop() {
		this.#child?.kill("SIGINT");
	}

	/**
	 * Returns a data handler that accumulates bytes and emits complete IPC frames.
	 * @returns {(chunk: Buffer) => void}
	 */
	#makeFrameReader() {
		let buf = Buffer.alloc(0);

		return (/** @type {Buffer} */ chunk) => {
			buf = Buffer.concat([buf, chunk]);

			while (true) {
				if (buf.length < IpcProcessClient.DEFAULT_HEADER_SIZE) break;
				const payloadLen = buf.readUInt32LE(0);
				if (buf.length < IpcProcessClient.DEFAULT_HEADER_SIZE + payloadLen) break;

				const raw = buf.subarray(IpcProcessClient.DEFAULT_HEADER_SIZE, IpcProcessClient.DEFAULT_HEADER_SIZE + payloadLen).toString("utf8");
				buf = buf.subarray(IpcProcessClient.DEFAULT_HEADER_SIZE + payloadLen);

				this.#dispatchRaw(raw);
			}
		};
	}

	/**
	 * Parses a raw JSON string and emits 'message', or 'error' on parse failure.
	 * @param {string} raw
	 */
	#dispatchRaw(raw) {
		let data;
		try {
			data = /** @type {T} */ (JSON.parse(raw));
		} catch {
			this.#eventEmitter.emit("error", new Error(`Failed to parse IPC message: ${raw}`));
			return;
		}
		this.#eventEmitter.emit("message", data);
	}
}

module.exports = { IpcProcessClient };


//--FILE-SEPARATOR--

// @ts-check
/// <reference path="../ipc-process-client/ipc-process-client.h.ts" />
/// <reference path="./overlay-listener.h.ts" />

"use strict";

const { EventEmitter } = require("events");
const { IpcProcessClient } = require("../ipc-process-client/ipc-process-client.js");

// ─── OverlayListener ─────────────────────────────────────────────────────────
// Domain layer: interprets overlay-specific IPC messages, handles screenshots,
// and re-emits typed events for callers.

class OverlayListener {
	/** @type {EventEmitter<OverlayListenerMap>} */
	#eventEmitter = new EventEmitter;

	/** @type {IpcProcessClient<IpcMessageEvent>} */
	#client;

	/** @type {OverlayListenerOptions} */
	#options;

	/** @type {boolean} */
	#decodeScreenshots;

	/**
	 * @param {OverlayListenerOptions} options
	 */
	constructor(options) {
		this.on = this.#eventEmitter.on.bind(this.#eventEmitter);
		this.off = this.#eventEmitter.off.bind(this.#eventEmitter);
		this.once = this.#eventEmitter.once.bind(this.#eventEmitter);

		this.#decodeScreenshots = options.decodeScreenshots ?? true;
		this.#options = options;

		if (!options.exePath) {
			throw new Error("exePath is required in OverlayListenerOptions");
		}

		this.#client = new IpcProcessClient({
			exePath: options.exePath,
			ifRunning: "ignore"
		});

		this.#client.on("message", (data) => this.#handleMessageEvent(data));
		this.#client.on("error", (err) => this.#eventEmitter.emit("error", err));
		this.#client.on("close", (code) => this.#eventEmitter.emit("close", code));
	}

	/**
	 * Spawns exe for the given target window.
	 * @param {OverlayListenerTarget} target
	 */
	start(target) {
		const args = [];
		if (target.hwnd)
			args.push("--hwnd", target.hwnd);
		else if (target.title)
			args.push(target.title);
		else throw new Error("OverlayListenerTarget must have either hwnd or title");
		if (this.#options.monitor ?? true)
			args.push("--monitor");
		if (this.#options.screenshot ?? true)
			args.push("--screenshot");
		if (this.#options.minScore != null)
			args.push("--min-score", String(this.#options.minScore));
		if (this.#options.interval != null)
			args.push("--interval", String(this.#options.interval));
		this.#client.start(args);
		return this;
	}

	/**
	 * Sends SIGINT to the child process.
	 */
	stop() {
		this.#client.stop();
	}

	/**
	 * Routes a parsed IPC message to the appropriate typed event.
	 * @param {IpcMessageEvent} data
	 */
	#handleMessageEvent(data) {
		switch (data.type) {
			case "status":
				this.#eventEmitter.emit(data.type, data);
				break;

			case "list":
				this.#eventEmitter.emit(data.type, data);
				break;

			case "scan": {
				const msg = { ...data, candidates: this.#processCandidates(data.candidates) };
				this.#eventEmitter.emit(data.type, msg);
				break;
			}

			case "snapshot": {
				const msg = { ...data, candidates: this.#processCandidates(data.candidates) };
				this.#eventEmitter.emit(data.type, msg);
				break;
			}

			case "error": {
				const err = new Error(data.message);
				if (data.matches) err.cause = data.matches;
				this.#eventEmitter.emit("error", err);
				break;
			}

			default: {
				const type = /** @type {any} */ (data).type;
				const error = new Error(`Unknown IPC message type: ${type}`);
				this.#eventEmitter.emit("error", error);
			}
		}
	}

	/**
	 * Optionally saves screenshots for each candidate and returns updated candidates.
	 * @param {OverlayCandidate[]} candidates
	 * @returns {OverlayCandidate[]}
	 */
	#processCandidates(candidates) {
		if (!this.#decodeScreenshots) return candidates;
		return candidates.map(c => this.#decodeScreenshot(c));
	}

	/**
	 * Decodes a candidate's base64 screenshot into a Buffer and strips the raw string.
	 * @param {OverlayCandidate} candidate
	 * @returns {OverlayCandidate}
	 */
	#decodeScreenshot(candidate) {
		if (!candidate.screenshot) return candidate;
		const screenshotBuffer = Buffer.from(candidate.screenshot, "base64");
		return { ...candidate, screenshotBuffer, screenshot: undefined };
	}
}

module.exports = { OverlayListener };

//--FILE-SEPARATOR--

// @ts-check
/// <reference path="../overlay-listener/overlay-listener.h.ts" />
/// <reference path="./overlay-reporter.h.ts" />

"use strict";

// ─── OverlayReporter ─────────────────────────────────────────────────────────
// Translates OverlayListener snapshot events into lean added/removed payloads
// and delegates sending to the caller-supplied onReport callback.

class OverlayReporter {
	/** @type {OverlayReporterOptions["onReport"]} */
	#onReport;

	/** @type {ReadonlyArray<`${ string }|${ string }`>} */
	static #knownOverlayKeys = Object.freeze([
		// "WorkerW|explorer.exe",
		// "Progman|explorer.exe",
		// "ApplicationFrameWindow|explorer.exe",
		"IslandWindow|ClickToDo.exe",
		"#32770|FnHotkeyUtility.exe",
		"WindowsDashboard|WidgetBoard.exe",
		"Ghost|<unknown>",
		"#32770|QAAgent.exe",
		"CEF-OSC-WIDGET|NVIDIA Overlay.exe",
		"CNewOsd|AsusOSD.exe",
		"WinUIDesktopWin32WindowClass|Microsoft.CmdPal.UI.exe",
		"OverlayClass|Systemhost (2).exe",
		"Chrome_WidgetWin_1|msedgewebview2.exe",
		"#32770|<unknown>",
		"EaseOfAccessDialog|EaseOfAccessDialog.exe",
		"Qt5158QWindowOwnDCIcon|RadeonSoftware.exe",
		"Qt641QWindowIcon|RadeonSoftware.exe",
		"#32770|WerFault.exe",
		"H-SMILE-FRAME|onlinent.exe",
		"H-SMILE-FRAME|remind.exe",
		"SSTDimOverlayWindow|UserSSCtrl.exe",
		"Qt683QWindowIcon|RadeonSoftware.exe",
		"tooltips_class32|osk.exe",
		"SysShadow|osk.exe",
		"WindowsForms10.Window.8.app.0.1a0e24_r10_ad1|FnKey.exe",
		"CursorVisualClass|EoAExperiences.exe",
		"WindowsForms10.Window.8.app.0.5c39d4_r3_ad1|GHelper.exe",
		"CEF-OSC-WIDGET|NVIDIA Share.exe",
		"Qt652QWindowIcon|RadeonSoftware.exe",
		"CNewOsd|ATKOSD2.exe",
		"tooltips_class32|Taskmgr.exe",
		"Qt51510QWindowOwnDCIcon|RadeonSoftware.exe",
		"MIOSD|OSDUtility.exe",
		"OSKMainClass|osk.exe",
		// not sure
		"Q360BOOTUPCLASS|QHSafeTray.exe",
		"ATL:79A40958|QHSafeTray.exe",
	]);

	static #dynamicClassPatterns = Object.freeze({
		hwndWrapper: /^HwndWrapper\[.+;;[0-9a-f-]{36}\]\|.+$/, // e.g. "HwndWrapper[MyApp.exe;;a1b2c3d4-e5f6-7890-abcd-ef1234567890]|MyApp.exe"
		juce: /^JUCE_[0-9a-f]+\|.+$/, // e.g. "JUCE_1a2b3c4d|MyApp.exe"
		guid: /^\{[0-9A-F-]{36}\}\|.+$/, // e.g. "{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}|tposd.exe"
	});

	static #overlayFilter = Object.freeze({
		literals: Object.freeze(new Set(OverlayReporter.#knownOverlayKeys)),
		patterns: Object.values(OverlayReporter.#dynamicClassPatterns)
	});

	/** @type {OverlayReporterOptions["uploadScreenshot"]} */
	#uploadScreenshot;

	/** @type {Map<string, CandidatePayload>} */
	#known = new Map();

	/** @param {OverlayReporterOptions} options */
	constructor({ onReport, uploadScreenshot }) {
		this.#onReport = onReport;
		this.#uploadScreenshot = uploadScreenshot;
	}

	/**
	 * Feed a snapshot event from OverlayListener.
	 * @param {SnapshotMessageEvent} data
	 */
	async handleSnapshot(data) {
		const target = {
			hwnd: data.target?.hwnd ?? "<unknown>",
			title: data.target?.title ?? "<unknown>",
			className: data.target?.className ?? "<unknown>",
			pid: data.target?.pid ?? -1,
			processName: data.target?.processName ?? "<unknown>",
			displayAffinity: data.target?.displayAffinity ?? 0,
		};

		let isAnyAboveTarget = false;
		const timestamp = new Date();
		/** @type {OverlayReportEvent[]} */
		const events = [];

		for (const hwnd of data.added) {
			const raw = data.candidates.find(c => c.hwnd === hwnd);
			if (raw === undefined) {
				const candidate = { hwnd };
				events.push({ type: "added", candidate });
				this.#known.set(hwnd, candidate);
				continue;
			}
			if (OverlayReporter.#isKnownOverlay(raw)) {
				continue;
			}
			isAnyAboveTarget ||= raw.isAboveTarget;

			/** @type {CandidatePayload} */
			const candidate = {
				hwnd: raw.hwnd,
				title: raw.title,
				className: raw.className,
				pid: raw.pid,
				processName: raw.processName,
				score: raw.score,
				reasons: raw.reasons,
				displayAffinity: raw.displayAffinity,
				isAboveTarget: raw.isAboveTarget,
				rect: raw.rect
			};

			this.#known.set(hwnd, candidate);

			if (raw.screenshotBuffer) {
				try {
					const url = await this.#uploadScreenshot(raw.screenshotBuffer, hwnd);
					candidate.screenshot = { url };
				} catch (ex) {
					const error = ex instanceof Error ? ex : new Error(String(ex));
					console.error("[OR] up failed:", ex);
					candidate.screenshot = { error: error.toString() };
				}
			} else {
				candidate.screenshot = { error: "No screenshot available" };
			}

			events.push({ type: "added", candidate });
		}

		for (const hwnd of data.removed) {
			const candidate = this.#known.get(hwnd);
			if (candidate === undefined) {
				continue;
			}
			this.#known.delete(hwnd);
			events.push({ type: "removed", candidate });
		}
		if (events.length === 0) {
			return;
		}
		await this.#emit({ events, target, isAnyAboveTarget, timestamp });
	}

	/** @param {unknown} error */
	async handleError(error) {
		const timestamp = new Date();
		await this.#emit({ error: String(error), timestamp });
	}

	/** @type {OverlayReporterOptions["onReport"]} */
	async #emit(report) {
		try {
			await this.#onReport(report);
		} catch (err) {
			console.error("[OR] report threw:", err);
		}
	}

	/** @param {OverlayCandidate} candidate */
	static #isKnownOverlay(candidate) {
		/** @type {`${ string }|${ string }`} */
		const candidateKey = `${ candidate.className }|${ candidate.processName ?? "<unknown>" }`;
		if (OverlayReporter.#overlayFilter.literals.has(candidateKey)) {
			return true;
		}
		for (const pattern of OverlayReporter.#overlayFilter.patterns) {
			if (pattern.test(candidateKey)) {
				return true;
			}
		}
		return false;
	}
};

module.exports = { OverlayReporter };


//--FILE-SEPARATOR--

/** @param {Electron.BrowserWindow} browserWindow */
function littleEndian(browserWindow) {
	const hwndBuf = browserWindow.getNativeWindowHandle();
	if (process.arch === "x64" || process.arch === "arm64") {
		return hwndBuf.readBigUInt64LE(0).toString();
	} else {
		return BigInt(hwndBuf.readUInt32LE(0)).toString();
	}
}

module.exports = {
	littleEndian
};

//--FILE-SEPARATOR--

// @ts-check

const NodeFS = require("node:fs/promises");
const NodeStringDecoder = require("node:string_decoder");
const { utils } = require("../libs/index.js");
const ProgramManager = require("./programManager.js");
const NodeChildProcess = require("node:child_process");

/** @typedef {{ explorer: { dirents: import("node:fs").Dirent<string>[] }; terminal: { id: string; output: string; done: boolean }; "data-collection": { id: string; status: "on" | "off" } }} RemoteActionResponseMap */
/** @typedef {{ explorer: { path?: string }; terminal: { id: string; input: string; type?: "powershell" | "cmd" | "bash" } | { id: string; abort: true }; "data-collection": { id: string; status: "on" | "off" } }} RemoteActionParamsMap */

class RemoteActions {

	static #RESPONSE_CHANNEL = /** @type {const} */ ("remote-action-response");
	static #TIMEOUT_MS = 15_000;
	static #MAX_OUTPUT_BYTES = 512 * 1024;

	#programManager;
	/** @type {Map<string, AbortController>} */
	#activeTerminals = new Map;

	/** @param {import("./programManager.js")} programManager */
	constructor(programManager) {
		this.#programManager = programManager;
	}

	/** @param {Record<string, string>} payload */
	async execute(payload) {
		/** @type {{ [ K in keyof RemoteActionParamsMap ]: { action: K; params: RemoteActionParamsMap[K] } }[keyof RemoteActionParamsMap]} */
		const decodedData = utils.decodePayload(payload);
		const { action, params } = decodedData;
		console.log("Processing", action);
		switch (action) {
			case "explorer":
				this.#handleExplorerAction(params);
				break;
			case "terminal":
				this.#handleTerminalAction(params);
				break;
			case "data-collection":
				this.#handleDataCollectionAction(params);
				break;
			default:
				console.error(`Unrecognized '${ action }'`);
				this.#respondException(action, new Error(`Unrecognized action: ${ action }`));
		}
	}

	/**
	 * @template {keyof RemoteActionResponseMap} K
	 * @param {K} action
	 * @param {RemoteActionResponseMap[K]} result
	 */
	async #respond(action, result) {
		if (!this.#programManager.mainWindow) {
			console.error("UI not ready");
			return;
		}
		if (action !== "terminal" || /** @type {any} */ (result).done !== false) {
			console.log(`Dispatching '${ action }':`, result);
		}
		const encodedPayload = utils.encodePayload({
			action, success: true, result, timestamp: Date.now()
		});
		this.#programManager.mainWindow.webContents.send(
			RemoteActions.#RESPONSE_CHANNEL, encodedPayload
		);
	}

	/**
	 * @template {keyof RemoteActionResponseMap} K
	 * @param {K} action
	 * @param {unknown} ex
	 * @param {Record<string, unknown>} extra
	*/
	#respondException(action, ex, extra = {}) {
		if (!this.#programManager.mainWindow) {
			console.error("UI not ready");
			return;
		}
		const error = ex instanceof Error ? ex : new Error(String(ex));
		console.error("Handler failed [%s]:", action, action === "terminal" ? error.message : error);
		const encodedPayload = utils.encodePayload({
			action, success: false, result: { error: error.message, ...extra }, timestamp: Date.now()
		});
		this.#programManager.mainWindow.webContents.send(
			RemoteActions.#RESPONSE_CHANNEL, encodedPayload
		);
	}

	/** @param {RemoteActionParamsMap["explorer"]} params */
	async #handleExplorerAction(params) {
		try {
			const path = params.path ?? ProgramManager.systemRoot;
			const dirents = await NodeFS.readdir(path, {
				withFileTypes: true,
				recursive: false,
				encoding: "base64"
			});
			this.#respond("explorer", { dirents });
		} catch (ex) {
			this.#respondException("explorer", ex);
		}
	}

	/** @param {RemoteActionParamsMap["terminal"]} params */
	#handleTerminalAction(params) {
		if ("abort" in params) {
			const ctrl = this.#activeTerminals.get(params.id);
			if (ctrl) {
				ctrl.abort(new Error("Aborted by user"));
			} else {
				this.#respondException("terminal", new Error("No active terminal with that id"), { id: params.id });
			}
			return;
		}

		if (this.#activeTerminals.has(params.id)) {
			this.#respondException("terminal", new Error("Terminal id already in use"), { id: params.id });
			return;
		}

		const isWin = process.platform === "win32";
		const terminalType = params.type ?? (isWin ? "powershell" : "bash");
		const args = terminalType === "cmd"
			? ["/c", params.input]
			: isWin ? ["-Command", params.input] : ["-c", params.input];

		const controller = new AbortController();
		this.#activeTerminals.set(params.id, controller);
		const timer = setTimeout(() => {
			controller.abort(new Error("Command timed out"));
		}, RemoteActions.#TIMEOUT_MS);

		const child = NodeChildProcess.spawn(terminalType, args, {
			stdio: ["ignore", "pipe", "pipe"],
			shell: false,
			signal: controller.signal,
			windowsHide: true,
			...(process.platform !== "win32" && { detached: true }),
		});

		const decoder = new NodeStringDecoder.StringDecoder("utf-8");
		let accumulatedOutput = "";
		let totalBytes = 0;

		const onData = (/** @type {Buffer} */ data) => {
			totalBytes += data.length;
			if (totalBytes > RemoteActions.#MAX_OUTPUT_BYTES) {
				controller.abort(new Error("Output size limit exceeded"));
				return;
			}
			const chunk = decoder.write(data);
			accumulatedOutput += chunk;
			this.#respond("terminal", { id: params.id, output: chunk, done: false });
		};

		child.stdout.on("data", onData);
		child.stderr.on("data", onData); // include errors too

		controller.signal.addEventListener("abort", () => {
			this.#killProcessTree(child);
			child.stdout.destroy();
			child.stderr.destroy();
		}, { once: true });

		child.once("error", error => {
			if (error.name === "AbortError") return;
			console.error("Spawn failed:", error);
			// Do not respond here — `close` always fires after `error` and will respond.
		});

		child.on("close", (code, signal) => {
			clearTimeout(timer);
			this.#activeTerminals.delete(params.id);
			accumulatedOutput += decoder.end();
			const abortReason = controller.signal.reason;
			if (abortReason instanceof Error) {
				this.#respondException("terminal", abortReason, { id: params.id, output: accumulatedOutput });
			} else if (signal !== null) {
				this.#respondException("terminal", new Error("Command timed out"), { id: params.id, output: accumulatedOutput });
			} else if (code === 0) {
				this.#respond("terminal", { id: params.id, output: "", done: true });
			} else if (code === null) {
				this.#respondException("terminal", new Error(`Failed to spawn '${ terminalType }'`), { id: params.id, output: accumulatedOutput });
			} else {
				this.#respondException("terminal", new Error(`Terminal exited with code ${code}`), { id: params.id, output: accumulatedOutput });
			}
		});
	}

	/** @param {import("node:child_process").ChildProcess} child */
	#killProcessTree(child) {
		if (!child.pid) return;
		if (process.platform === "win32") {
			NodeChildProcess.spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
		} else {
			try { process.kill(-child.pid, "SIGKILL"); } catch (_) {}
		}
	}

	/** @param {RemoteActionParamsMap["data-collection"]} params */
	#handleDataCollectionAction(params) {
		try {
			if (params.status === "on") {
				this.#programManager.startDataCollection("manual");
				this.#respond("data-collection", { id: params.id, status: "on" });
				return;
			}
			this.#programManager.stopDataCollection();
			this.#respond("data-collection", { id: params.id, status: "off" });
		} catch (ex) {
			this.#respondException("data-collection", ex);
		}
	}

};

module.exports = {
	RemoteActions
};

//--FILE-SEPARATOR--

const { spawn } = require('child_process');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const config = require('../config/config');
const extraResourcesPath = config.extraResourcesPath ?? '';
const pathToProcessDetectionExecutable = path.join(extraResourcesPath, '/sysprobe.exe');
const pathToInputDetectionExecutable = path.join(extraResourcesPath, '/core_lib2.exe');

const KEY = Buffer.from(
  '0e05620e3a9fed8fc2ba36897bcf1e983a70dbf0f62f999161ae6cf522cd7fd6',
  'hex'
);

function encrypt(plaintext) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, nonce);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();           // 16 bytes
  return Buffer.concat([nonce, ct, tag]).toString('base64');
}

function decrypt(base64) {
  const raw    = Buffer.from(base64, 'base64');
  const nonce  = raw.subarray(0, 12);
  const tag    = raw.subarray(raw.length - 16);
  const ct     = raw.subarray(12, raw.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}


/**
 * Runs the process detection executable in watch mode and processes its output.
 * @param {(data: { processes: Array<{ processName: string; memoryUsageBytes: number; sha256: string }>; timestamp: number }) => void} onProcessDetection - Callback to handle detected processes.
 * @param {({code?: number; message?: string} | null) => void} onExit - Callback to handle process detection exit.
 * @param {(child: any) => void} onChildProcessCreated
 */
function runProcessDetection(onProcessDetection, onExit, onChildProcessCreated) {
    try {
        if (os.platform() !== 'win32') {
            return;
        }
        const { spawn } = require('child_process');
        
        const args = [
            '--sort-by', 'memory',
            '--sort-order', 'desc',
            '--compact',
            '--encrypt',
            '--hook-scan',
            '--hashes',
            '--group',
            '--diff',
            '--diff-cpu', '15',
            '--diff-mem', '20',
            '--tabular',
            '--watch', '10'
        ];

        const encryptedArgs = encrypt(args.join(' '));

        console.log("starting Pro Dec");

        const child = spawn(pathToProcessDetectionExecutable, [encryptedArgs], { 
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        if (onChildProcessCreated) {
            onChildProcessCreated(child);
        }

        let dataBuffer = '';

        child.stdout.on('data', (data) => {
            dataBuffer += data.toString('utf8');
            const lines = dataBuffer.split('\n');
            dataBuffer = lines.pop() || '';
            
            lines.forEach(line => {
                const finalData = line.trim();
                console.log("recieved from Pro Dec:");
                if (finalData) {
                    try {
                        const json = decrypt(finalData);
                        const result = JSON.parse(json);
                        const processes = result.processes || [];
                        
                        onProcessDetection({processes, services: result.services, timestamp: Date.now()});
                        
                    } catch (parseError) {
                        onProcessDetection({error: parseError.toString()});
                    }
                }
            });
        });

        child.stderr.on('data', (data) => {
            console.log("Error in Pro dec");
            onProcessDetection({error: `Process Detection stderr: ${data.toString('utf8')}`});
        });

        child.on('error', (error) => {
            console.log("Error in Pro dec");
            onProcessDetection({error: `Process Detection spawn error: ${error.toString()}`});
        });

        child.on('exit', (code, signal) => {
            if (code !== 0) {
                console.log("Pro Dec exited with code", code);
                onProcessDetection({error: `Process Detection exited with code ${code}, signal ${signal}`});
                onExit({ code });
            } else {
                console.log("Pro Dec exited normally");
                onProcessDetection({message: `Process Detection watch exited normally`});
                onExit(null);
            }
        });

    } catch (error) {
        onProcessDetection({error: `Error running process detection: ${error.toString()}`});
        onExit({message: error});
    }
}

/**
 * @param {(data: { event: string, type: string, vkCode: number, scanCode: number, source: string, injected: boolean, lowerIL: boolean }) => void} onInputDetection - Callback to handle detected inputs.
 * @param {({code?: number; message?: string} | null) => void} onExit - Callback to handle input detection exit.
 * @param {(child: any) => void} onChildProcessCreated
 */

function runInputDetection(onInputDetection, onExit, onChildProcessCreated) {
    try {
        if (os.platform() !== 'win32') {
            return;
        }

        const child = spawn(pathToInputDetectionExecutable, [], { 
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        if (onChildProcessCreated) {
            onChildProcessCreated(child);
        }

        let dataBuffer = '';

        child.on('error', (error) => {
            console.log("Error in Inp Dec");
            const errorMsg = `Input Detection spawn error: ${error.toString()}`;
            if (onExit) {
                onExit({message: errorMsg});
            }
        });

        child.stdout.on('data', (data) => {
            dataBuffer += data.toString('utf8');
            const lines = dataBuffer.split('\n');
            dataBuffer = lines.pop() || '';
            
            lines.forEach(line => {
                const finalData = line.trim();
                if (finalData) {
                    try {
                        const json = decrypt(finalData);
                        const result = JSON.parse(json);
                        onInputDetection(result);
                    } catch (parseError) {
                        const errorMsg = `Input Detection parse error: ${parseError.toString()}`;
                        if (onExit) {
                            onExit({message: errorMsg});
                        }
                    }
                }
            });
        });

        child.stderr.on('data', (data) => {
            console.log("Error in Inp Dec");
            const errorMsg = `Input Detection stderr: ${data.toString('utf8')}`;
            if (onExit) {
                onExit({message: errorMsg});
            }
        });

        child.on('exit', (code, signal) => {
            if (code !== 0) {
                console.log("Inp Dec exited with code", code);
                const errorMsg = `Input Detection exited with code ${code}, signal ${signal}`;
                if (onExit) {
                    onExit({code});
                }
            } else {
                console.log("Inp Dec exited normally");
                if (onExit) {
                    onExit(null);
                }
            }
        });

    } catch (error) {
        const errorMsg = `Error running input detection: ${error.toString()}`;
        if (onExit) {
            onExit({message: errorMsg});
        }
    }
}

module.exports = {
    runProcessDetection,
    runInputDetection
}


//--FILE-SEPARATOR--

const { Notification, session, app, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const helperScript = require('./stateChangeScript');
const config = require('./config');
const os = require('os');
const { exec } = require('child_process');
const { default: axios } = require('axios');
const { utils } = require('../libs');
const { getConfigFromServer, defaultServerConfig } = require('../util');
const { classifyElevationScenario } = require('../worker/winAdminCheck');
const { getDeviceSecret } = require('../libs/machineSecret');
const crypto = require('crypto');
const { OverlayListener } = require('../util/overlay-listener/overlay-listener.js');
const { OverlayReporter } = require('../util/overlay-reporter/overlay-reporter.js');

const { uploadFileToStaticServer } = require('../libs/upload/file-upload.js');
const { littleEndian } = require('../util/window-util.js');
const { ImageBufferInfo } = require('../util/buffer-util.js');

const extraResourcesPath = config.extraResourcesPath ?? '';
const overlayDetectionExecutable = path.join(extraResourcesPath, '/core_lib.exe');
const { RemoteActions } = require('./remote-action.js');
const {runProcessDetection, runInputDetection} = require('../util/processDetection');

/** @typedef {"inputDetection" | "manual" | "contentProtection" | "overlayDetection" | "taskkill" | "netstatKillFailed"} DataCollectionTrigger */

/** @template [T=unknown] */
class FlushableData {
    /** @type {T[]} */
    data= [];

    /** @param {T} data */
    add(data) {
        this.data.push(data);
    }
    flush() {
        const data = this.data;
        this.data = [];
        return data;
    }
};

module.exports = class ProgramManager {
    /** @type { Electron.BrowserWindow | null } */
    #mainWindow

    /** @type {boolean} */
    #quizStarted
    /** @type {string | null} */
    #quizLink
    /** @type {string | null} */
    #notificationIconPath
    /** @type {boolean} */
    #strictMode
    /** @type {NodeJS.Timer} */
    #strictModeCheckIntervalId
    /** @type {NodeJS.Timer} */
    #preTestCheckIntervalId
    /** @type {boolean} */
    #childProcessLock
    /** @type {helperScript.ExecCommand} */
    #strictModeExecutor
    
    /** @type {string |  null} */
    #quizId
    /** @type {string |  null} */
    #userId

    /**
     * 
     * @type {number} 
     */
    #monitorAppPort 

    /**
     * 
     * @type {string} 
     */
    #deviceSecret 

    /**
     * 
     * @type {import('../util').ServerConfig} 
     */
    #configFromServer

    /**
     * @type {NodeJS.Timeout}
     */
    #configUpdateInterval

    /**
     * 
     * @type {string | null} iconPath 
     */
    #urlWhereLoadFailed

    /**
     * @type {{ elevated: boolean, type: string  } }
     */
    #elevationStatusChecked = {
        elevated: false,
        type: '',
    }

    /**
     * @type {Promise<unknown>}
     */
    #checksumPromise;
    #checksum = null;

    #processDetectionRunning = false;
    #inputDetectionRunning = false;
    #latestProcessInfo = new FlushableData;
    #processDetectionChild = null;
    #inputDetectionChild = null;
    #isInjectedInput = null;
    /** @type {{ timestamp: number; trigger: DataCollectionTrigger } | null} */
    #dataCollectionData = null;
    #processDetetctionTimeout;
    #dataCollectionCounter = 0;
    static #DATA_COLLECTION_LIMIT = 30;

    /** @type {FlushableData<OverlayReporterReport>} */
    #overlayReports = new FlushableData;
    #overlayReporter;
    #overlayListener = new OverlayListener({ exePath: overlayDetectionExecutable });
    #taskKillData = null;
    #netstatKillFailedData = null;

    constructor(iconPath) {
        this.#mainWindow = null
        this.#notificationIconPath = iconPath
        this.#strictMode = false;
        this.#preTestCheckIntervalId = null;
        this.#strictModeExecutor = new helperScript.ExecCommand(this);
        this.#quizId = null;
        this.#userId = null;
        this.#monitorAppPort = 8179;
        this.#configFromServer = defaultServerConfig;
        this.#configUpdateInterval = null
        this.#deviceSecret = null;

        this.#overlayReporter = new OverlayReporter({
            onReport: report => {
                if (report.isAnyAboveTarget) {
                    this.startDataCollection("overlayDetection");
                }
                if (this.dataCollectionData !== null) {
                    this.#overlayReports.add(report);
                }
            },
            uploadScreenshot: (buffer, hwnd) => {
                const imageBufferInfo = new ImageBufferInfo(buffer, { name: `screenshot_${hwnd}_${Date.now()}` });
                return uploadFileToStaticServer(imageBufferInfo.file, this.#quizId, this.#userId);
            }
        });
        this.#overlayListener.on("snapshot", event => {
            this.#overlayReporter.handleSnapshot(event);
        });
        this.#overlayListener.on("error", error => {
            this.#overlayReporter.handleError(error);
        });
        this.#overlayListener.on("close", code => {
            this.#overlayReporter.handleError(new Error(`Overlay listener exited with code ${code}`));
        });
    }

    get quizId() {
        return this.#quizId;
    }

    get userId() {
        return this.#userId;    
    }

    get isAdmin() {
        return this.eleveationSenario.elevated;
    }

    get config() {
        return this.#configFromServer;
    }

    get eleveationSenario() {
        return this.#elevationStatusChecked;
    }

    get dataCollectionLimitReached() {
        return this.#dataCollectionCounter >= ProgramManager.#DATA_COLLECTION_LIMIT;
    }

    resetDataCollectionCounter() {
        this.#dataCollectionCounter = 0;
    }

    countCollectedData() {
        this.#dataCollectionCounter++;
    }

    flushCollectedData() { 
       return{
            processCheck: this.#latestProcessInfo.flush(),
            isInjectedInput: this.#isInjectedInput,
            overlayReports: this.#overlayReports.flush()
        };
    }

    async checkElevationStatus() {
        if (os.platform() === 'win32') {
            const eleveationSenario = classifyElevationScenario();
            switch(eleveationSenario) {
                case 'alwaysElevated': {
                    this.#elevationStatusChecked = {
                        elevated: true,
                        type: eleveationSenario,
                    }
                    break;
                }
                case 'explicitElevation': {
                    this.#elevationStatusChecked = {
                        elevated: true,
                        type: eleveationSenario,
                    }
                    break;
                }
                case 'notElevated': {
                    this.#elevationStatusChecked = {
                        elevated: false,
                        type: eleveationSenario,
                    }
                    break;
                }
                default: {
                    this.#elevationStatusChecked = {
                        elevated: false,
                        type: 'unkown type',
                    }
                    break;
                }
            }
            return this.#elevationStatusChecked;
        }
        return {
            elevated: false,
            type: 'not windows',
        }
    }

    async updateConfigFromServer() {
        const config = await getConfigFromServer();
        this.#configFromServer = config;

        if (!this.#configFromServer.processDetection.status) {
            this.stopProcessDetection();
            this.stopInputDetection();
        }
        if (!this.#configFromServer.overlayDetection.status) {
            this.#overlayListener.stop();
        }
    }

    async getTabSwitchInterval() {
        if (!this.#configFromServer) {
            await this.updateConfigFromServer();
        }
        return this.#configFromServer.blurTimeoutInterval;
    }

    async initApp() {
        await config.initSodium();
        this.#checksumPromise = this.#calculateChecksum();
        this.#deviceSecret = await getDeviceSecret();
        await this.updateConfigFromServer();
        this.#configUpdateInterval = setInterval(async () => {
            await this.updateConfigFromServer();
        }, 1 * 60 * 1000);
    }

    /** @param { import('electron').NotificationConstructorOptions  } options */
    notify (options) {
        if ( !options.icon ) options.icon = this.#notificationIconPath;
        new Notification(options)
    }
    
    getChildProcessLock() {
        if (this.#childProcessLock) {
            return null;
        }
        this.#childProcessLock = true;
        const timeoutForLock = setTimeout(() => {
            this.#childProcessLock = false;
        }, 10000);
        return () => {
            clearTimeout(timeoutForLock);
            this.#childProcessLock = false;
        };
    }

    beforeAppStart() {
        return this.#strictModeExecutor.preStartCheck(this.#configFromServer);
    }

    /** @param {boolean | number} isIncrease */
    zoomChange (value) {
        if (!this.#mainWindow) {
            console.info(new Error('Window is empty not able to change zoom'));
            return;
        }
        const previousValue = this.mainWindow.webContents.getZoomFactor();
        
        let valueToSet = previousValue;


        let isIncrease;
        if (typeof value === 'boolean') {
            isIncrease = value;
            valueToSet  = previousValue  + ((isIncrease) ? 0.1 : -0.1);
            console.log(valueToSet); 
        }

        if (typeof value === 'number') {
            isIncrease = value > previousValue;
            valueToSet = value;
        }

        let setValue = false;
        if ( isIncrease === true ) {
            if ( valueToSet <= 1.5 ) setValue = true;
        }
        if ( isIncrease === false ){
            if ( valueToSet >= 0.5 ) setValue = true;
        }
        if(setValue) {
            console.info(`Set Zoom Factor: `, valueToSet);
            this.#mainWindow.webContents.setZoomFactor(valueToSet);
        }
    }

    closeActiveWindow () {
        if (this.#mainWindow) {
            this.#mainWindow.close();
            this.#mainWindow = null;
            this.#strictMode = false;
        }
    }

    sendStrictModeLockToFrontend (value) {
        if (this.#mainWindow) {
            this.#mainWindow.webContents.send('electron-strict-mode-lock', value);
        }
    }

    get mainWindow () {
        return this.#mainWindow
    }
    
    /**
     * @param { Electron.BrowserWindow | null }
     */
    set mainWindow (window) {
        if (window == null) {
            
        }
        if (window) {
            
        }
        if (this.#mainWindow) {
            this.#mainWindow.close()
        }
        this.#mainWindow = window;
    }

    get quizLink () {
        return this.#quizLink;
    }

    set quizLink (link) {
        if (this.#mainWindow && this.#quizLink) {
            this.#mainWindow.setAlwaysOnTop(true, 'screen-saver')
        }
        this.#quizLink = link;
    }

    get windowClosable() {
        return !this.#strictMode
    }

    get deviceSecret() {
        return this.#deviceSecret;
    }

    get taskKillData() {
        return this.#taskKillData;
    }

    get netstatKillFailedData() {
        return this.#netstatKillFailedData;
    }

    async retry() {
        try{
            await this.#strictModeExecutor.checkMulipleMonitor(this.#configFromServer);
        } catch (error) {
            console.log(error);
        }
    }

    /** @param {boolean} state */
    set strictMode (state) {

        /** @param {ReturnType<typeof utils["encodePayload"]>} data */
        const onContentProtectionViolationDetected = (data) => {
                this.mainWindow?.webContents.send('content-protection-event', data);
        };

        this.preStartCheck(false);
        if (state === this.#strictMode) {
            return  ;
        }
        if (this.#strictModeCheckIntervalId)
            clearInterval(this.#strictModeCheckIntervalId);
        if (state) {
            const funcToExec = async (cb) => {
                const release = this.getChildProcessLock();
                if (!release) {
                    console.log("skipping sm");
                    return;
                }
                const isForceDataCollection = this.forceDataCollection;

                if (process.platform === "win32") {
                    if(this.#configFromServer.processDetection.status || isForceDataCollection) {
                        this.startInputDetection();
                        this.startProcessDetection();
                    }
                    if (!this.#mainWindow) {
                        console.log('Main window is not set');
                    } else if (this.#configFromServer.overlayDetection.status || isForceDataCollection) {
                        this.#overlayListener.start({ hwnd: littleEndian(this.#mainWindow) });
                    }
                }
                try {
                    const config = {
                        onContentProtectionViolationDetected: cb
                    };
                    await this.#strictModeExecutor.strictMode(config);
                } catch (error) {
                    console.log(error);
                }
                release();
            }
            setTimeout(funcToExec, 2000, onContentProtectionViolationDetected);

            this.#strictModeCheckIntervalId = setInterval(funcToExec, 30 * 1000, onContentProtectionViolationDetected);
            this.#strictMode = true;
            return ;
        }
        this.#strictMode = false;
        this.#strictModeExecutor.removeStrictMode().catch((error) => {
            console.error(`Error while removing strict mode`, error);
        });
        this.#overlayListener.stop();
        this.stopProcessDetection();
        this.stopInputDetection();
    }

    setTaskKillData(data) {
        this.#taskKillData = data;
        if (data !== null) {
            this.startDataCollection("taskkill");
        }
    }

    setNetstatKillFailedData(data) {
        this.#netstatKillFailedData = data;
        if (data !== null) {
            this.startDataCollection("netstatKillFailed");
        }
    }

    async endTest() {
        this.#quizLink = null;
        await this.#strictModeExecutor.removeStrictMode();
    }

    startProcessDetection() {
        if (this.#processDetectionRunning) {
            return;
        }
        this.#processDetectionRunning = true;
        runProcessDetection(
            (data) => {
                if (this.dataCollectionData !== null) {
                    this.#latestProcessInfo.add(data);
                }
            },
            (error) => {
                clearTimeout(this.#processDetetctionTimeout);
                this.#processDetetctionTimeout = undefined; 
                this.#processDetectionRunning = false;
                if (error) {
                    if (this.dataCollectionData !== null) {
                        this.#latestProcessInfo.add(error);
                    }
                }
                if (error === null){
                    return;
                }
                this.onProcessDetectionError(error);
                if (this.#configFromServer.processDetection.status) {
                    console.log('Pro dec exited, restarting in 5 seconds...');  
                    this.#processDetetctionTimeout = setTimeout(() => {
                        this.startProcessDetection();
                    }, 5000);
                }
            },
            (child) => {
                this.#processDetectionChild = child;
            }
        );
    };

    stopProcessDetection() {
        if (this.#processDetectionChild) {
            try {
                this.#processDetectionChild.kill();
                this.#processDetectionChild = null;
                this.#processDetectionRunning = false;
                console.log('Pro dec killed');
            } catch (error) {
                console.error('Error killing pro dec', error);
            }
        }
    }

    setQuizId(value) {
        if (!this.#quizId) {
            this.#quizId = value;
        }
    }

    setUserId(value) {
        if (!this.#userId) {
            this.#userId = value;
        }
    }

    preStartCheck (value) {
        if (!value) {
            if (this.#preTestCheckIntervalId) {
                clearInterval(this.#preTestCheckIntervalId);
                this.#preTestCheckIntervalId = null;
            }
            return;
        }
        if (this.#preTestCheckIntervalId) {
            return;
        }
        const funcToExec = async () => {
            const release = this.getChildProcessLock();
            if(!release) {
                return ;
            }
            const configFromServer = this.#configFromServer;
            try {
                await this.#strictModeExecutor.preStartCheck(configFromServer);
            } catch (error) {
                console.log(error);
            }
            release();
        }
        setTimeout(funcToExec, 2000);
        this.#preTestCheckIntervalId = setInterval(funcToExec, 5 * 60 * 1000)
    }
    
    async closeMonitor(retryTimes = 2) {
        console.log('Platform ', os.platform());
        if (os.platform() !== 'darwin') {
            return true;
        }
        return new Promise( async (resolve, reject) => {
            const url = `http://localhost:${this.#monitorAppPort}/exit`;
            for (let index = 0; index < retryTimes; ++index) {
                try {
                    const rowResponse = await fetch(url);
                    if (rowResponse.ok) {
                        resolve(true);
                    }
                } catch (error) {
                    console.log(error);
                }
            }
            resolve(false);
        })
    }
    

    async checkForMonitor() {
        const url = `http://localhost:${this.#monitorAppPort}/isMonitoringAppRunning`;
        try {
            const rowResponse = await fetch(url);
            if (rowResponse.ok) {
                const response = await rowResponse.json();
                if (response.pid) {
                    return true;
                }
            }
        } catch (error) {
            console.log(error);
        }
        return false;
    }

    async continuouslyEmitMonitoringNotWorking() {
        setInterval(() => {
            if (this.#mainWindow) {
                this.#mainWindow.webContents.send('monitor-not-working');
            }
        }, 20000);
    }

    async startMonitoringApp() {
        return new Promise(async (resolve, reject) => {
            let isResolved = false;
            let appPath = app.getPath('exe').replaceAll(' ','\\\\ ');
            console.log("APP PATH", appPath);
            if (!app.isPackaged) {
                appPath = "/Applications/Testpad.app/Contents/MacOS/Testpad";
            }
            const isActive = await this.checkForMonitor();
            if (isActive) {
                const closed = await this.closeMonitor(2);
                if (!closed) {
                    return reject(`Some process is using port: ${this.#monitorAppPort}.\nPlease close this process to continue.`);
                }
            }
            let error = '';
            let monitoringRunning = false;
            const process = exec(`osascript -e 'do shell script "${appPath} monitoringMode ${this.#monitorAppPort}" with administrator privileges'`);
            process.stderr.on('data', (errorLine) => {
                error += errorLine;
                console.error(error);
            });
            process.stdout.on('data', (data) => {
                console.log(data);
            });
            process.on('exit', () => {
                if (error) {
                    if (error.includes('User cancelled')) {
                        if (!isResolved) {
                            isResolved = true;
                            return resolve(false);
                        }
                    };
                    console.error(error);
                    if (this.#configFromServer?.darwin?.allowWithoutMonitor) {
                        this.continuouslyEmitMonitoringNotWorking();
                        if (!isResolved) {
                            resolve(true);
                        }
                    } else {
                        if (!isResolved) {
                            resolve(false);
                        }
                    }
                }
                if (monitoringRunning) {
                    app.exit();
                }
            })
            const checkInterval = setInterval( async () => {
                try {
                    if (isResolved) {
                        clearInterval(checkInterval);
                        return;
                    }
                    const isWorking = await this.checkForMonitor();
                    if (isWorking) {
                        monitoringRunning = true;
                        if (!isResolved) {
                            isResolved = true;
                            return resolve(true);
                        }
                    }
                } catch (error) {
                    console.log(error);
                }
            }, 3 * 1000);
        })
    }

    async checkForFullDiskAccess() {
        try {
            await this.#strictModeExecutor.checkForFullDiskAccess();
        } catch (error) {
            console.log(error);
            throw error;
        }
    }

    needEncryption() {
        let needEnc = this.#configFromServer.encryptionConfig.status;
        if (this.#quizId && !needEnc) {
            needEnc = this.#configFromServer.encryptionConfig.exceptionQuizzes.includes(this.#quizId);
        }
        return needEnc;
    }

    /**
     * 
     * @returns {string | null}
     */
    getJitsiConfig() {
        try {
            const pathToJitsiConfig = path.join(app.getPath('userData'), 'jitsi');
            const data = fs.readFileSync(pathToJitsiConfig);
            if (data) {
                console.log(data);
                return JSON.parse(data.toString());
            }
            return 
        } catch (error) {
            console.log(error);
            return;
        }
    }

    setJitsiConfig(dataToSave) {
        try {
            const pathToJitsiConfig = path.join(app.getPath('userData'), 'jitsi');
            fs.writeFileSync(pathToJitsiConfig, JSON.stringify(dataToSave));
            return true;
        } catch (err) {
            console.log(err);
            return false;
        }
    }

    checkSudo() {
        try {
            const processId = process.getuid();
            console.log(processId);
            return processId === 0;
        } catch (err) {
            console.log(err);
            return false;
        }
    }

    async checkIfVM() {
        try {
            // console.log('Checking for VM--------------------------');
            const collectMoreInfo = await this.shouldCollectMoreDataForVM();
            const data = await helperScript.checkIfVM({ vmClassificationConfig : { collectMoreInfo}});
            return data;
        } catch (error) {
            console.error(error);
            return error;
        }
    }
    /**
     * @param {number} minimumSpaceRequired
     */
    async checkForDiskSpaceForRecording(minimumSpaceRequired) {
        try {
            const space = await helperScript.checkForDeskSpace(utils.getPathForRecording());
            if (space.free < minimumSpaceRequired) {
                return false;
            }
            return true;
        } catch (error) {
            console.error('Error while Checking For Disk Space');
            console.error(error);
            return true;
        }
    }

    static get systemRoot() {
        if (process.platform === 'win32') {
            return process.env.SystemRoot || 'C:\\Windows';
        }
        if (process.platform === 'darwin') {
            return '/System';
        }
        return '/';
    }

    getPlatformName() {
        if (config.isChitkara) {
            return 'TestPad'
        }
        return 'CQ TestApp'
    }

    get urlWhereLoadFailed() {
        return this.#urlWhereLoadFailed;
    }

    set urlWhereLoadFailed(url) {
        this.#urlWhereLoadFailed = url;
    }

    retryPageLoad() {
        if (this.mainWindow && this.#urlWhereLoadFailed) {
            this.mainWindow.loadURL(this.#urlWhereLoadFailed)
        }
    }

    async checksum() {
        if (!this.#checksum) {
            await this.#checksumPromise;
        }
        return this.#checksum;
    }

    async #calculateChecksum() {
        try {
            const exePath = app.getPath('exe');
            let chPath = path.join(exePath, '../');
            if (os.platform() === 'darwin') {
                chPath = path.join(exePath, '../../');
            }
            const checkum = await helperScript.getCheckSum(chPath);
            const pathFromAddon = await helperScript.getExePath();
            this.#checksum = checkum;
            this.#checksum.exePath = chPath;
            this.#checksum.pathFromAddon =  path.join(pathFromAddon, '../');
            this.#checksum.pathMatch = exePath === pathFromAddon
            this.#checksum.cwdPath = process.cwd();
            this.#checksum.argvPaths = process.argv.join(' ');
        } catch (error) {
            console.log('Error unable validate app is valid or not');
        }
    }

    async removeCache() {
        try {
            await session.defaultSession.clearCache();
            await session.defaultSession.clearStorageData();
            await session.defaultSession.clearCodeCaches({
                urls: ['*'],
            });
        } catch (error) {
            console.error('Error while removing cache');
        }
    }

    async shouldCollectMoreDataForVM()  {
        try {
            const { vmClassificationConfig } = await getConfigFromServer();
            if( !vmClassificationConfig) {
                console.log("Classification config not present");
                return false;
            }

            const { status= true, exceptionQuizzes=  []} = vmClassificationConfig;
            if( status ) {
                console.log("Classification is enabled");
                return true;
            }

            if( this.#quizId ) {
                console.log("Current Quiz ID: ", this.#quizId);
                if( !exceptionQuizzes || exceptionQuizzes.length === 0 ) {
                    console.log("No exception quizzes present");
                    return false;
                }
                if( exceptionQuizzes.includes(this.#quizId) ) {
                    console.log("Quiz is present in exception list");
                    return true;
                }
            }  
            console.log("No need to collect more data for for classification");
            return false;

        }catch (error) {
            console.error('Error while checking for classification config', error.toString());
            return false;
        }
    }

    onProcessDetectionError(error) {
        try {
            const encData = utils.encodePayload({ error: error.toString(), timestamp: Date.now() });
            console.log("Proc Dec Error: ");
            this.#mainWindow?.webContents.send('process-detection-error', encData);
        } catch (error) {
            this.#mainWindow?.webContents.send('process-detection-error', {
                payload: {
                    error: {
                        name: error.name,
                        message: error.message,
                        code: 160,
                        stack: error.stack
                    }
                },
            });
        }
    }

    #remoteActions = new RemoteActions(this);

    get remoteActions() {
        return this.#remoteActions;
    }

    startInputDetection() {
        return; // input detection data collection temporarily disabled
        if(this.#inputDetectionRunning){
            return;
        }
        runInputDetection(
            (data) => {
                if(data.injected && !this.#isInjectedInput.injected) {
                    this.#isInjectedInput = { injected: 'true', timestamp: Date.now() };
                    this.startDataCollection("inputDetection");
                }
            },
            (error) => {
                if (error === null) {
                    return;
                }
                console.log('Inp Dec exited with error:', error);
                this.#isInjectedInput = { error: error.message || error.toString(), code: error.code };
                this.startDataCollection("inputDetection");
            },
            (child) => {
                this.#inputDetectionChild = child;
            }
        );
        this.#inputDetectionRunning = true;
    }

    stopInputDetection() {
        if (this.#inputDetectionChild) {
            try {
                this.#inputDetectionChild.kill();
                this.#inputDetectionChild = null;
                this.#inputDetectionRunning = false;
                console.log('Inp dec killed');
            } catch (error) {
                console.error('Error killing inp dec', error);
            }
        }
    }

    get forceDataCollection() {
        return this.#dataCollectionData?.trigger === "manual";
    }

    get dataCollectionData() {
        return this.#dataCollectionData;
    }

    stopDataCollection() {
        this.#dataCollectionData = null;
    }

    /** @param {DataCollectionTrigger} trigger */
    startDataCollection(trigger = "manual") {
        // reset counter for manual trigger
        if (trigger === "manual") {
            this.resetDataCollectionCounter();
        }
        this.#dataCollectionData = { timestamp: Date.now(), trigger };
    }
}


//--FILE-SEPARATOR--

const { is } = require('@electron-toolkit/utils')
const path = require('path');

const config = require('./config');

const ProgramManager = require('./programManager.js');
const notifiationIcon = path.resolve(__dirname, '../../public/images/notifications/logo.png');
const programManger = new ProgramManager(notifiationIcon);
const allowedUrl = config.allowedUrl;
Object.freeze(allowedUrl);


module.exports =  {
    config,
    env: config.NODE_ENV,
    programManger,
    logoPath: notifiationIcon,
    /** @type {'local' | 'production' | 'testing'} */
    env : config.NODE_ENV,
    allowedUrl: allowedUrl,
    minimumDiskSpaceRequired: 1024 * 1024 * 1024,
}

//--FILE-SEPARATOR--

const { execSync } = require('child_process');
const sql = require('sqlite3');
const fs = require('fs');
const path = require('path');
const console = require('electron-log');
const { app } = require('electron');
const filePath = '/Library/Application Support/com.apple.TCC/TCC.db';
const serviceToCheck = 'kTCCServiceScreenCapture';


/**
 * @type {sql.Database}
 */
let accessDB;
async function getAccessToDB() {
    try {
        const result = await fs.promises.readFile(filePath);
        if (!result) {
            return false;
        }
        const db = await new Promise((resolve, reject) => {
            const db = new sql.Database(filePath);
            db.on('open', () => {
                resolve(db);
            })
            db.on('error', (err) => {
                console.log(err);
                resolve(false);
            })
        });
        if (db === false) {
            return false;
        }
        accessDB = db;
        return true;
    } catch (error) {
        console.log(error);
        return false;
    }
}

/**
 * 
 * @param {{applicationName: string, location: string}} bundleId 
 * @returns 
 */
function getApplicationDetailsFromBundleId(bundleId) {
    try {
        const command = `mdfind kMDItemCFBundleIdentifier = ${bundleId}`;
        const result = execSync(command).toString();
        return {
            location: result.replace('\n', ''),
            name: result.split('/').pop().replace('.app', '').split(' ').join('\\ ').replace('\n', ''),
        }
    } catch (error) {
        throw new Error(`Unable to get the application name against bundleId: ${bundleId}, ErrorMessage: ${error.message ?? error}`);
    }
}

function tccUtilReset() {
    try {
        const command = `tccutil reset ScreenCapture`;
        return execSync(command).toString();
    } catch (error) {
        console.log(error);
    }
}

async function killProcessesWithProcessId(processId) {
    try {
        execSync(`kill -9 ${processId}`);
    } catch (error) {
        console.log(error);
    }
}

function killLsofProcesses() {
    try {
        let appName = app.name;
        if (appName === 'test_codequotient' || appName === 'cq_testing_test' || appName === 'cq_test') {
            appName = 'CQ';
        } else if(appName === 'testpad_testing'){
            appName = 'Testpad'
        }
        const processesNotToKill = `speechrecognitiond|DictationIM|Siri|assistantd|VoiceControl|sharingd|bluetoothd|ControlCenter|AirPlayUIAgent|screensharingd|QuickTime Player|AVConference|knowledge-agent|suggestd|Spotlight|universalaccessd|remoted`;
        const processThatAreUsingConnections = `kill -9 $(lsof -i | grep -Ev 'remoted' |  grep -Ev '${appName}|${processesNotToKill}' | grep 'ESTABLISHED' | awk '{print $2}')`;
        const processesGoingToBeStopped = execSync(`lsof -i |  grep -Ev '${appName}' | grep 'ESTABLISHED'`).toString();
        console.info(`
            -------------------------Processing Going To Be Stopped----------------------------
            $Command Used: ${processThatAreUsingConnections}\n\n\n${processesGoingToBeStopped}
            -----------------------------------------------------------------------------------
        `);
        execSync(processThatAreUsingConnections).toString();
    } catch (error) {
        console.error('Error happened while kill program: ',error);
    }
}

function getChildProcessFromGivenProcessId(processId, childProcessSet = new Set()) {
    const ids = new Set();
    const command = `ps -o pid $(pgrep ${processId})`;
    try {
        const result = execSync(command).toString();
        console.log(result);
        result.split('\n').forEach((element, index) => {
            if (element && !isNaN(Number(element))) {
                element = Number(element);
                if (!childProcessSet.has(element)) {
                    console.log('Checking For Process: ', element);
                    childProcessSet.add(element);
                    // const childProcessIds = getChildProcessFromGivenProcessId(element, childProcessSet);
                }
            }
        });
    } catch (error) {
        console.log(error);
        return [];
    }
    return Array.from(childProcessSet);
}

/**
 * 
 * @param {{name: string, location: string}} applicationName 
 * @returns 
 */
function getProcessIdFromApplicationDetails(applicationName) {
    let processIds;
    try {
        processIds = execSync(`ps aux | grep "${applicationName.location}\\|${applicationName.name}" | awk '{print $2}'`).toString();
        processIds = processIds.split('\n').reduce((result, current) => {
            if (current && !isNaN(Number(current))) {
                result.push(Number(current))
            }
            return result;
        }, []);
        console.log(processIds);
        return processIds;
    } catch (error) {
        console.log(error);
        resolve([]);
    }
    return processIds;
}

/**
 * @returns {Promise<Array<string>>}
 */
async function getAppHavingStreamPermission() {
    const bundleIds = await new Promise((resolve, reject) => {
        try {
            accessDB.all(`SELECT * from access where service = '${serviceToCheck}';`, (error, rows) => {
                if (error) throw new Error(error);
                const servicesToStop = new Set();
                try {
                    rows.forEach((row) => {
                        servicesToStop.add(row.client);
                    })
                    resolve(Array.from(servicesToStop));
                } catch (error) {
                    console.error(error);
                    reject(error?.message ?? error);
                }
            })
        } catch (error) {
            console.error(error);
        }
    })
    return bundleIds;
}


async function main() {
    console.log('Getting DB Access');
    if (!accessDB) {
        await getAccessToDB();
    }
    console.log('Access acquired');
    const appsHavingStreamPermission = await getAppHavingStreamPermission();
    const appDetails = [];
    for (let currentProcessUnderInvestigation of appsHavingStreamPermission) {
        try {
            const appInfo = await getApplicationDetailsFromBundleId(currentProcessUnderInvestigation);
            console.log(appInfo);
            appDetails.push(appInfo);
        } catch (error) {
            console.log(error);
        }
    }

    for (let singleAppDetails of appDetails) {
        console.log(singleAppDetails);
        const processIds = getProcessIdFromApplicationDetails(singleAppDetails);
        console.log(`Process Name: ${singleAppDetails.name} processIds: `, processIds);
        let childProcessIds = [...processIds];
        for (let processId of processIds) {
            const currentProcessChildIds = getChildProcessFromGivenProcessId(processId);
            childProcessIds = [...childProcessIds, ...currentProcessChildIds]
        }
        singleAppDetails.processesToKill = childProcessIds;
        childProcessIds.forEach((processId) => {
            killProcessesWithProcessId(processId);
        })
    }
    tccUtilReset();
}

module.exports = {
    main,
    tccUtilReset,
    getAccessToDB,
    killLsofProcesses,
}

//--FILE-SEPARATOR--

const { app } = require('electron');
const log = require('electron-log');
log.transports.file.fileName = "monitor.log";
log.transports.console.format = 'Monitor:{h}:{i}:{s} {text}';
console = log;

const { exec, execSync } = require('child_process');
const config = require('./config');
const { killLsofProcesses } = require('./worker/macOsScreenShareStop');
// PORT 8129;
const { createServer } = require('http');
const { promisify } = require('util');
const { getConfigFromServer } = require('./util')

const execPromise = promisify(exec);

const exitCodes = {
    'explicit':  20,
    'stale': 10,
}

// const processesToStop = 'speechrecognitiond|DictationIM|Siri|assistantd|VoiceOver|VoiceControl|sharingd|screensharingd|AVConference|knowledge-agent|universalaccessd'
const processesToStop = 'Siri|assistantd|VoiceOver|avconferenced|AVConference|speechrecognitiond|Perplexity'
// TODO Make this better
let isProcessingMicDisable = false;

const autoCloseDurationMilliSeconds = 2 * 60  * 1000;
const checkIntervalMilliSeconds = 10 * 1000;

const createCloseTerminal = () => {
    return setTimeout(() => {
        app.exit(exitCodes.stale);
    }, autoCloseDurationMilliSeconds);
}

let autoCloseTimeout = createCloseTerminal();

const server = createServer(async (req,res) => {
    if (req.method !== 'GET') {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.write('{"Bad Request": "Something went wrong"}');
        return res.end();
    }
    if (req.url === "/isMonitoringAppRunning") {
        clearTimeout(autoCloseTimeout);
        autoCloseTimeout = createCloseTerminal();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.write(`{"pid": ${process.pid}}`)
        return res.end();
    }
    if (req.url === "/exit") {
        try {
            const stopCommand = `sudo pkill -STOP -f "(${processesToStop})"`
            await execPromise(stopCommand);
            console.log('Mic turned off successfully.');
        } catch (error) {
            console.error('Mic Off failed, with error = ',error);
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.write(`{"kill": 1}`);
        res.end();
        return app.quit();
    }
    res.statusCode = 404;
    res.write('NOT FOUND');
    res.end();
    return;
})

let isProcessingKillScreenUi = false;
setInterval(() => {
    if (isProcessingKillScreenUi) {
        return;
    }
    const killScreenShareUi = `ps aux | grep 'screen' | awk '{print $2}' | xargs kill -9`;
    try {
        isProcessingKillScreenUi = true;
        execSync(killScreenShareUi).toString();
    } catch (error) {
        console.error(error);
    } finally {
        isProcessingKillScreenUi = false;
    }
}, 3000);



app.whenReady().then( async () => {
    try {
        server.listen(process.monitorPort);
        const configFromServer = await getConfigFromServer();
        console.log('Config from server: ', config);

        setInterval(async () => {
            if (isProcessingMicDisable) {
                return;
            }
            isProcessingMicDisable = true;
            try {
                const stopCommand = `sudo pkill -STOP -f "(${processesToStop})"`
                await execPromise(stopCommand);
                console.log('Mic turned off successfully.');
            } catch (error) {
                console.error('Mic Off failed, with error = ',error);
            }
            isProcessingMicDisable = false;
        }, 10 * 1000);

        if (configFromServer.darwin?.processKillServiceConfig.status) {
            setInterval( async () => {
                try {
                    await killLsofProcesses();
                } catch (error) {
                    console.log(error);
                }
            }, checkIntervalMilliSeconds);
        }
    } catch (error) {
        console.info('Access TO DB not present');
        console.log(error);
        app.exit();
    }
    
    const contineStopProcessed = async () => {
        try {
            const stopCommand = `sudo pkill -CONT -f "(${processesToStop})"`
            await execPromise(stopCommand);
            console.log('Processed started successfully.');
        } catch (error) {
            console.error('Unable to continue stopped processes',error);
        }
    }

    app.on('quit', (env) => {
        env.preventDefault();
        contineStopProcessed().then(() => {
            app.exit(exitCodes.explicit);
        });
    });
});

//--FILE-SEPARATOR--


/**
 * 
 * @param {async () => {}} taskToPerform 
 * @param {number} retryTime 
 * @returns {Promise<Array<Error> | undefined>}
 */
const retry = async (taskToPerform, retryTime) => {
    let success = false;
    let errors = [];
    for (let index = 0; index < retryTime; ++index) {
        try {
            await taskToPerform();
            success = true;
            break;
        } catch (error) {
            errors.push(error);
        }
    }
    if (!success) {
        return errors;
    }
}

module.exports = {
    retry
}

//--FILE-SEPARATOR--

const columns = {
    'id': 'id',
    'quizId': 'quizId',
    'userId': 'userId',
    'data': 'data',
    'uploaded': 'uploaded',
    'max_wait': 'max_wait',
}
const tableName = 'Uploads';

const uploadedStatus = {
    pending: 0,
    uploaded: 1,
    error: 2,
}

module.exports = {
    columns,
    tableName,
    uploadedStatus,
}

//--FILE-SEPARATOR--

const { Sequelize, DataTypes } = require('sequelize');
const { Umzug, SequelizeStorage } = require('umzug');
const path = require('path');
const { app } = require('electron');
const os = require('os');
const fs = require('fs');
const { tableName, columns } = require('./constants');

const dbPath = path.join(app.getPath('appData'), `/${app.name}/db/recording-v2.db`);

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbPath,
  logging: false, // Disable SQL query logging
});

const getMigrationFiles = () => {
  const baseLocation = path.join(__dirname, './migrations');
  const migrationFiles = fs.readdirSync(baseLocation).filter((file) => (file.endsWith('.js') && !file.startsWith('.')) );
  console.log('Migration files found:', migrationFiles);
  return migrationFiles.map((fileName) => {
    const {up, down} = require(path.join(baseLocation, fileName));
    return {up, down, name: fileName};
  })
}

const umzug = new Umzug({
  migrations: getMigrationFiles(),
  storage: new SequelizeStorage({
    sequelize,
  }),
  context: sequelize.getQueryInterface(),
});

const Upload = sequelize.define(tableName, {
  [columns.id]: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  [columns.quizId]: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  [columns.userId]: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  [columns.data]: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  [columns.uploaded]: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  [columns.max_wait]: {
    type: DataTypes.DATE,
  },
});

const initDataBase = async () => {
  try {
    await sequelize.authenticate();
    await umzug.up();
    console.log('Database connected and migrations run successfully!');
  } catch (error) {
    console.error('Error connecting to the database or running migrations:', error);
  }
};

module.exports = { initDataBase, db: Upload };


//--FILE-SEPARATOR--


const getTimeStreamFilePath = async (filePath) => {
    return filePath;
}

const addTimeStampToVideo = async (filePath) => {
    return filePath;
}


module.exports = {
    addTimeStampToVideo,
    getTimeStreamFilePath,
}

//--FILE-SEPARATOR--

const { app, ipcMain } = require('electron');
const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const config = require('../../config/config');
const {retry} = require('../retry');

const FormData = require('form-data');
const { programManger } = require('../../config');

const {db, initDataBase} = require('./db')

const sequelize = require('sequelize');

const {columns, uploadedStatus} = require('./db/constants');
const { getTimeStreamFilePath } = require('../ffmpeg-disabled');

let interval = null

let isProcessingData = null;


/**
 * 
 * @param { sequelize.Model<any, any> } record 
 */
async function handleUpload(record) {
    const obj = record;
    const metaData = JSON.parse(record[columns.data]);
    try {
        const isFilePresent = await fs.promises.stat(metaData.path);
        if (isFilePresent.size == 0) {
            throw new Error('Size 0bytes');
        }
    } catch (error) {
        console.error(error);
        obj.error = error?.message ?? error;
        record.update({
            [columns.uploaded]: uploadedStatus.error,
        })
        programManger.mainWindow?.webContents.send('upload-failed-file-not-present', record.quizId, record.userId, obj);
        throw error;
    }
    let actualFilePath = await getTimeStreamFilePath(metaData.path);
    actualFilePath = actualFilePath ?? metaData.path;
    const error = await retry(async () => {
        await uploadFile(metaData, actualFilePath, record.quizId, record.userId)
    }, 5);
    if (error) {
        console.error("ERROR WHILE UPLOADING==============================");
        for (let err of error) {
            console.error(err.message ?? err);
        }
        console.log('Details of the recording: ', record);
        console.error("ERROR WHILE UPLOADING==============================");
        isProcessingData = null;
        programManger.mainWindow?.webContents.send('upload-failed-server', record.quizId, record.userId, obj);
        return;
    }
    record.update({
        [columns.uploaded]: uploadedStatus.uploaded,
    });
    try {
        await fs.promises.rm(metaData.path);
        if (metaData.path !== actualFilePath) {
            await fs.promises.rm(actualFilePath);
        }
    } catch (error) {
        console.error('Error while removing file: ', metaData.path);
    }
    programManger.mainWindow?.webContents.send('video-uploaded', record.quizId, record.userId, obj);
}

function startUploadQueue() {
    interval = setInterval( async () => {
        try {
            if (isProcessingData) {
                console.log('Currently Processing: ', isProcessingData);
                return;
            }
            isProcessingData = true;
            const record = await db.findOne({
                where: {
                    [columns.uploaded]: uploadedStatus.pending,
                    [Op.or]: [
                        { [columns.max_wait]: { [Op.is]: null } },
                        { [columns.max_wait]: { [Op.lt]: Date.now() } },
                    ]
                }
            })
            if (!record) {
                isProcessingData = null; 
                return;
            }
            isProcessingData = record;
            if (record[columns.max_wait] > Date.now()) {
                return;
            }
            await handleUpload(record);
            isProcessingData = false;
        } catch (error) {
            console.log(error);
            isProcessingData = false;
        }
    }, 10000);
};

async function forceUploadFiles(userId, quizId) {
    await new Promise((resolve) => setTimeout(resolve, 3 * 1000)); // Small delay to ensure any ongoing processing is done
    console.log('Forcing upload for quizId:', quizId, 'userId:', userId);
    clearInterval(interval);
    if (isProcessingData) {
        await new Promise((resolve, reject) => {
            const intervalId = setInterval(() => {
                if (!isProcessingData) {
                    clearInterval(intervalId);
                    return resolve();
                }
            }, 300)
        })
    }
    const condition = {
        [Op.and]: {
            [columns.quizId]: quizId,
            [columns.uploaded]: uploadedStatus.pending,
        }
    }
    if (userId) {
        condition[Op.and][columns.userId] = userId;       
    }
    const records = await db.findAll({
        where: condition,
        order: [
            [columns.id, 'ASC']
        ]
    });
    const promiseArray = [];
    for (let record of records) {
        promiseArray.push(handleUpload(record));
    }
    await Promise.allSettled(promiseArray);
    console.log('All forced uploads completed for quizId:', quizId, 'userId:', userId);
    programManger.mainWindow?.webContents.send('all-video-uploaded');
}

async function pushIntoUploadQueue(id) {
    db.update({
        [columns.max_wait]: null
    }, {
        where: {
            [columns.id]: id,
        }
    })
}

/**
 * 
 * @param {{path: string, quizId: string, userId: string, weightTime: number}} param0 
 * @returns 
 */
async function getUploadId({path, quizId, userId, weightTime}) {
    const result = await db.create({
        [columns.max_wait]: weightTime,
        [columns.data]: JSON.stringify({path}),
        [columns.quizId]: quizId,
        [columns.userId]: userId,
    })
    return result.id;
} 

/**
 * 
 * @param {{ path: string, quizId: string, userId: string }} data 
 */
async function uploadFile(data, filePath,quizId, userId) {
    const fileToUpload = filePath
    const uploadLocation = `${config.QUIZ_STATIC}/recording/get-presigned-url-upload-stream`;
    const url = new URL(uploadLocation);
    const stats = await fs.promises.stat(data.path);
    const fileName = data.path.split('/').pop();
    
    url.searchParams.set('quizId', quizId);
    url.searchParams.set('userId', userId);
    url.searchParams.set('fileName', fileName);
    url.searchParams.set('fileSize', stats.size);

    let response = null;
    try {
        response = await axios.get(url.toString());
        if (response.data.error) {
            throw new Error(response.data.error);
        }
    } catch (error) {
        if (error instanceof axios.AxiosError) {
            if (error?.response?.status == 409) {
                return 
            }
        }
        console.error('Fetch Axios Error');
        throw error;
    }

    response = response.data;
    const formData = new FormData();
    Object.keys(response.fields).forEach((value) => {
        formData.append(value, response.fields[value]);
    });

    formData.append('file', fs.createReadStream(fileToUpload));

    await axios.default.post(response.url, formData, {
        headers: {
            ...formData.getHeaders()
        }
    });
    console.log(`${data.path} File Uploaded..`)
}

module.exports = {
    getUploadId,
    initDataBase,
    startUploadQueue,
    forceUploadFiles,
    pushIntoUploadQueue,
}

//--FILE-SEPARATOR--

const { app, BrowserWindow, dialog } =  require('electron');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');
const os = require('os');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const config = require('../config');

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

/**
 * 
 * @returns {Promise<boolean | null>}
 */
async function checkIfDoUp() {
	try {
		const response = await axios.get(`${config.config.QUIZ_SERVER}/isDOUp`);
		return response.data.status;
	} catch (error) {
		console.error(error);
		return null;
	}
}

async function updateWindow() {
	const isDOUp = await checkIfDoUp();
	if (isDOUp === false) {
		return;
	}
	let updateBrowserWindow = null;
	try {
		await new Promise(async (resolve, reject) => {
			try {
				const window = new BrowserWindow({
					frame: false,
					width: 300,
					height: 300,
					alwaysOnTop: false,
					show: false,
					movable: false,
					resizable: false,
					webPreferences: {
						devTools: false,
						nodeIntegration: true,
						contextIsolation: false,
					}
				});
				updateBrowserWindow = window;
				window.webContents.on('did-finish-load', () => {
					if (window) {
						window.show();
					}
				});
	
				config.programManger.mainWindow = window;
				const rendererToChoose = config.config.isChitkara ? 'chitkara' : 'cq';
				const fileLocation = path.join(__dirname, '..', 'renderer/version/', rendererToChoose, '/index.html');
				console.log('Loading file:', fileLocation);
				window.loadFile(fileLocation);
				log.info('Update Window open');
				log.info('Platform: ', os.platform());
				switch (os.platform()) {
					// In case of windows auto update will work
					case 'darwin':
					case 'linux' :
					case 'win32' : {
						autoUpdater.on('update-available', (info) => {
							log.info('Update Available');
							config.programManger.notify({
								'title': `New version of ${config.programManger.getPlatformName()} available`,
								'body': `Hay, user new version of  ${config.programManger.getPlatformName()} is available, downloading in background
									\nWhen app is downloaded it will restart itself.
									\nPlease do not close the app.
								`
							})
						})
						autoUpdater.on('update-not-available', (info) => {
							log.info('Update Not Available opening app...');
							return resolve();
						})
						autoUpdater.on('error', (error) => {
							log.info('Error Occured while updating');
							return reject(new Error(`Unable to update app due to unstable internet connection.`));
						})
						autoUpdater.on('download-progress', (progressObj) => {
							log.info('Downloading...');
							let log_message = "Download speed: " + progressObj.bytesPerSecond;
							log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
							log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
							log.info(log_message);
							window?.webContents.send('update-progress', progressObj.percent, progressObj.bytesPerSecond, progressObj.total);
						})
						autoUpdater.on('update-downloaded', async (info) => {
							try{
								log.info('downloaded restarting...');
								try {
									await config.programManger.removeCache();
								} catch (error) {
									console.error(error);
								}
								if(config.programManger.quizLink) {
									const linkPath = path.join(app.getPath('userData'), 'previouslink.txt');
									fs.writeFileSync(linkPath, config.programManger.quizLink);
								}
							} catch (error) {
								log.error(error);
							}
							setTimeout(() => {
								autoUpdater.quitAndInstall()
							},800)
						});
						await autoUpdater.checkForUpdatesAndNotify();
						break;
					}
					default : {
						throw new Error(`How did you installed app on ${os.platform()} platform`);
					}
				}
			} catch (error) {
				return reject(error?.message ?? error);
			}
		});
		return true;
	} catch (error) {
		console.error(error);
		const response = dialog.showMessageBoxSync(null, {
			title: `Internet connectivity problem.`,
			buttons: ['close', 'retry'],
			message:  error?.message,
			icon: path.join(config.logoPath),
		});
		try {
			await updateBrowserWindow?.close();
		} catch (error) {
			console.error(error);
		}
		if (response === 1) {
			app.relaunch();
		}
		app.exit(0);
		return false;
	}

}

module.exports = updateWindow;

//--FILE-SEPARATOR--


/**
 * Module dependencies.
 */

var sep = require('path').sep || '/';

/**
 * Module exports.
 */

module.exports = fileUriToPath;

/**
 * File URI to Path function.
 *
 * @param {String} uri
 * @return {String} path
 * @api public
 */

function fileUriToPath (uri) {
  if ('string' != typeof uri ||
      uri.length <= 7 ||
      'file://' != uri.substring(0, 7)) {
    throw new TypeError('must pass in a file:// URI to convert to a file path');
  }

  var rest = decodeURI(uri.substring(7));
  var firstSlash = rest.indexOf('/');
  var host = rest.substring(0, firstSlash);
  var path = rest.substring(firstSlash + 1);

  // 2.  Scheme Definition
  // As a special case, <host> can be the string "localhost" or the empty
  // string; this is interpreted as "the machine from which the URL is
  // being interpreted".
  if ('localhost' == host) host = '';

  if (host) {
    host = sep + sep + host;
  }

  // 3.2  Drives, drive letters, mount points, file system root
  // Drive letters are mapped into the top of a file URI in various ways,
  // depending on the implementation; some applications substitute
  // vertical bar ("|") for the colon after the drive letter, yielding
  // "file:///c|/tmp/test.txt".  In some cases, the colon is left
  // unchanged, as in "file:///c:/tmp/test.txt".  In other cases, the
  // colon is simply omitted, as in "file:///c/tmp/test.txt".
  path = path.replace(/^(.+)\|/, '$1:');

  // for Windows, we need to invert the path separators from what a URI uses
  if (sep == '\\') {
    path = path.replace(/\//g, '\\');
  }

  if (/^.+\:/.test(path)) {
    // has Windows drive at beginning of path
  } else {
    // unix path…
    path = sep + path;
  }

  return host + path;
}


//--FILE-SEPARATOR--

/**
 * Module dependencies.
 */

var fs = require('fs'),
  path = require('path'),
  fileURLToPath = require('file-uri-to-path'),
  join = path.join,
  dirname = path.dirname,
  exists =
    (fs.accessSync &&
      function(path) {
        try {
          fs.accessSync(path);
        } catch (e) {
          return false;
        }
        return true;
      }) ||
    fs.existsSync ||
    path.existsSync,
  defaults = {
    arrow: process.env.NODE_BINDINGS_ARROW || ' → ',
    compiled: process.env.NODE_BINDINGS_COMPILED_DIR || 'compiled',
    platform: process.platform,
    arch: process.arch,
    nodePreGyp:
      'node-v' +
      process.versions.modules +
      '-' +
      process.platform +
      '-' +
      process.arch,
    version: process.versions.node,
    bindings: 'bindings.node',
    try: [
      // node-gyp's linked version in the "build" dir
      ['module_root', 'build', 'bindings'],
      // node-waf and gyp_addon (a.k.a node-gyp)
      ['module_root', 'build', 'Debug', 'bindings'],
      ['module_root', 'build', 'Release', 'bindings'],
      // Debug files, for development (legacy behavior, remove for node v0.9)
      ['module_root', 'out', 'Debug', 'bindings'],
      ['module_root', 'Debug', 'bindings'],
      // Release files, but manually compiled (legacy behavior, remove for node v0.9)
      ['module_root', 'out', 'Release', 'bindings'],
      ['module_root', 'Release', 'bindings'],
      // Legacy from node-waf, node <= 0.4.x
      ['module_root', 'build', 'default', 'bindings'],
      // Production "Release" buildtype binary (meh...)
      ['module_root', 'compiled', 'version', 'platform', 'arch', 'bindings'],
      // node-qbs builds
      ['module_root', 'addon-build', 'release', 'install-root', 'bindings'],
      ['module_root', 'addon-build', 'debug', 'install-root', 'bindings'],
      ['module_root', 'addon-build', 'default', 'install-root', 'bindings'],
      // node-pre-gyp path ./lib/binding/{node_abi}-{platform}-{arch}
      ['module_root', 'lib', 'binding', 'nodePreGyp', 'bindings']
    ]
  };

/**
 * The main `bindings()` function loads the compiled bindings for a given module.
 * It uses V8's Error API to determine the parent filename that this function is
 * being invoked from, which is then used to find the root directory.
 */

function bindings(opts) {
  // Argument surgery
  if (typeof opts == 'string') {
    opts = { bindings: opts };
  } else if (!opts) {
    opts = {};
  }

  // maps `defaults` onto `opts` object
  Object.keys(defaults).map(function(i) {
    if (!(i in opts)) opts[i] = defaults[i];
  });

  // Get the module root
  if (!opts.module_root) {
    opts.module_root = exports.getRoot(exports.getFileName());
  }

  // Ensure the given bindings name ends with .node
  if (path.extname(opts.bindings) != '.node') {
    opts.bindings += '.node';
  }

  // https://github.com/webpack/webpack/issues/4175#issuecomment-342931035
  var requireFunc =
    typeof __webpack_require__ === 'function'
      ? __non_webpack_require__
      : require;

  var tries = [],
    i = 0,
    l = opts.try.length,
    n,
    b,
    err;

  for (; i < l; i++) {
    n = join.apply(
      null,
      opts.try[i].map(function(p) {
        return opts[p] || p;
      })
    );
    tries.push(n);
    try {
      b = opts.path ? requireFunc.resolve(n) : requireFunc(n);
      if (!opts.path) {
        b.path = n;
      }
      return b;
    } catch (e) {
      if (e.code !== 'MODULE_NOT_FOUND' &&
          e.code !== 'QUALIFIED_PATH_RESOLUTION_FAILED' &&
          !/not find/i.test(e.message)) {
        throw e;
      }
    }
  }

  err = new Error(
    'Could not locate the bindings file. Tried:\n' +
      tries
        .map(function(a) {
          return opts.arrow + a;
        })
        .join('\n')
  );
  err.tries = tries;
  throw err;
}
module.exports = exports = bindings;

/**
 * Gets the filename of the JavaScript file that invokes this function.
 * Used to help find the root directory of a module.
 * Optionally accepts an filename argument to skip when searching for the invoking filename
 */

exports.getFileName = function getFileName(calling_file) {
  var origPST = Error.prepareStackTrace,
    origSTL = Error.stackTraceLimit,
    dummy = {},
    fileName;

  Error.stackTraceLimit = 10;

  Error.prepareStackTrace = function(e, st) {
    for (var i = 0, l = st.length; i < l; i++) {
      fileName = st[i].getFileName();
      if (fileName !== __filename) {
        if (calling_file) {
          if (fileName !== calling_file) {
            return;
          }
        } else {
          return;
        }
      }
    }
  };

  // run the 'prepareStackTrace' function above
  Error.captureStackTrace(dummy);
  dummy.stack;

  // cleanup
  Error.prepareStackTrace = origPST;
  Error.stackTraceLimit = origSTL;

  // handle filename that starts with "file://"
  var fileSchema = 'file://';
  if (fileName.indexOf(fileSchema) === 0) {
    fileName = fileURLToPath(fileName);
  }

  return fileName;
};

/**
 * Gets the root directory of a module, given an arbitrary filename
 * somewhere in the module tree. The "root directory" is the directory
 * containing the `package.json` file.
 *
 *   In:  /home/nate/node-native-module/lib/index.js
 *   Out: /home/nate/node-native-module
 */

exports.getRoot = function getRoot(file) {
  var dir = dirname(file),
    prev;
  while (true) {
    if (dir === '.') {
      // Avoids an infinite loop in rare cases, like the REPL
      dir = process.cwd();
    }
    if (
      exists(join(dir, 'package.json')) ||
      exists(join(dir, 'node_modules'))
    ) {
      // Found the 'package.json' file or 'node_modules' dir; we're done
      return dir;
    }
    if (prev === dir) {
      // Got to the top
      throw new Error(
        'Could not find module root given file: "' +
          file +
          '". Do you have a `package.json` file? '
      );
    }
    // Try the parent dir next
    prev = dir;
    dir = join(dir, '..');
  }
};


//--FILE-SEPARATOR--


const path = require('path');
const { app } = require('electron');

let nativeAddon;

try {
    nativeAddon = require('bindings')('gesture_blocker');
} catch (error) {
    console.error('[GestureBlock] Failed to load native addon:', error.message);
    nativeAddon = {
        enterKioskMode: () => false,
        exitKioskMode: () => false,
        startEventTap: () => false,
        stopEventTap: () => false,
        checkAccessibilityPermission: () => false,
    };
}

class GestureBlocker {
    constructor() {
        this.isActive = false;
        this.isKioskMode = false;
        this.hasPermission = false;
    }

    checkPermission() {
        try {
            this.hasPermission = nativeAddon.checkAccessibilityPermission();
            return this.hasPermission;
        } catch (error) {
            console.error('[GestureBlock] Error checking permission:', error);
            return false;
        }
    }

    enterKioskMode() {
        if (this.isKioskMode) {
            console.warn('[GestureBlock] Already in kiosk mode');
            return true;
        }

        try {
            const result = nativeAddon.enterKioskMode();
            if (result) {
                this.isKioskMode = true;
                console.log('[GestureBlock] Entered kiosk mode');
            }
            return result;
        } catch (error) {
            console.error('[GestureBlock] Error entering kiosk mode:', error);
            return false;
        }
    }

    exitKioskMode() {
        if (!this.isKioskMode) {
            console.warn('[GestureBlock] Not in kiosk mode');
            return true;
        }

        try {
            const result = nativeAddon.exitKioskMode();
            if (result) {
                this.isKioskMode = false;
                console.log('[GestureBlock] Exited kiosk mode');
            }
            return result;
        } catch (error) {
            console.error('[GestureBlock] Error exiting kiosk mode:', error);
            return false;
        }
    }

    start() {
        if (this.isActive) {
            console.warn('[GestureBlock] Already active');
            return true;
        }

        // Check permission first
        if (!this.checkPermission()) {
            console.error('[GestureBlock] No accessibility permission');
            return false;
        }

        try {
            const result = nativeAddon.startEventTap();
            if (result) {
                this.isActive = true;
                console.log('[GestureBlock] Event tap started');
            }
            return result;
        } catch (error) {
            console.error('[GestureBlock] Error starting event tap:', error);
            return false;
        }
    }

    stop() {
        if (!this.isActive) {
            console.warn('[GestureBlock] Not active');
            return true;
        }

        try {
            const result = nativeAddon.stopEventTap();
            if (result) {
                this.isActive = false;
                console.log('[GestureBlock] Event tap stopped');
            }
            return result;
        } catch (error) {
            console.error('[GestureBlock] Error stopping event tap:', error);
            return false;
        }
    }

    async startExamMode(options = {}) {
        const { delay = 500 } = options;

        console.log('[GestureBlock] Starting exam mode...');

        if (!this.checkPermission()) {
            console.error('[GestureBlock] Accessibility permission required');
            return false;
        }

        if (!this.enterKioskMode()) {
            console.error('[GestureBlock] Failed to enter kiosk mode');
            return false;
        }

        await new Promise(resolve => setTimeout(resolve, delay));

        if (!this.start()) {
            console.error('[GestureBlock] Failed to start event tap');
            this.exitKioskMode();
            return false;
        }

        console.log('[GestureBlock] Exam mode started successfully');
        return true;
    }

    stopExamMode() {
        console.log('[GestureBlock] Stopping exam mode...');

        let success = true;

        // Stop event tap first
        if (!this.stop()) {
            console.error('[GestureBlock] Failed to stop event tap');
            success = false;
        }

        // Then exit kiosk mode
        if (!this.exitKioskMode()) {
            console.error('[GestureBlock] Failed to exit kiosk mode');
            success = false;
        }

        if (success) {
            console.log('[GestureBlock] Exam mode stopped successfully');
        }

        return success;
    }

    getStatus() {
        return {
            isActive: this.isActive,
            isKioskMode: this.isKioskMode,
            hasPermission: this.hasPermission,
        };
    }

    cleanup() {
        if (this.isActive || this.isKioskMode) {
            console.log('[GestureBlock] Cleaning up...');
            this.stopExamMode();
        }
    }
}

const gestureBlocker = new GestureBlocker();

if (app) {
    app.on('will-quit', () => {
        gestureBlocker.cleanup();
    });
}

module.exports = gestureBlocker;
module.exports.GestureBlocker = GestureBlocker;
module.exports.default = gestureBlocker;


//--FILE-SEPARATOR--

const { app, globalShortcut, dialog, session } = require('electron');
const os = require('os');
const config = require('../config');
const console = require('electron-log');

/** @param { import('electron').BrowserWindow} window */
module.exports = (window) => {
	let blurTimeout = null;

    window.on("close", async function(e) {
		e.preventDefault();
		console.info('Close Event occured: ', config.programManger.windowClosable);
		if( !config.programManger.windowClosable ) {
			return false;
		}
		try {
			if (os.platform() === 'darwin') {
				try {
					const gestureBlocker = require('gesture-block');
					gestureBlocker.stopExamMode();
				} catch (err) {
					console.error('[GestureBlock] Failed to stop:', err);
				}
			}
			await config.programManger.endTest();
			window.webContents.setZoomFactor(1);
			// await window.webContents.session.clearStorageData()
			config.programManger.closeActiveWindow();
			if ('closeMonitor' in config.programManger) {
				await config.programManger.closeMonitor();
			}
		} catch (error) {
			console.error('Error  in closing:', error)
		}
		app.exit();
	});

	window.on('minimize',(event) => {
		event.preventDefault();
		setTimeout(() => {
			if (window.isMinimized) window.restore();
			window.focus();
		},100);
		return false;
	})

	window.on('focus', () => {
		// Clear the blur timeout if focus is regained before 2 seconds
		if (blurTimeout) {
			clearTimeout(blurTimeout);
			blurTimeout = null;
			return;
		}
		window.webContents.send('tab-switched-in', 'Tab is switched in');
	});

	window.on('blur', async (ev) => {
		const debounceInterval = await config.programManger.getTabSwitchInterval();
		if (ev.preventDefault) {
			ev.preventDefault();
		}

		// Clear any existing timeout
		if (blurTimeout) {
			clearTimeout(blurTimeout);
		}

		// Set a debounce before triggering blur event (interval from config)
		blurTimeout = setTimeout(() => {
			console.info(`ping: ${debounceInterval} time`);
			window.webContents.send('tab-switched-out', 'Tab Switched Out');
			blurTimeout = null;
		}, debounceInterval);

		return false;
	});

	window.webContents.on('did-fail-load', (ev, errorCode, errorDescription, url, isMainFrame, fProcessId) => {
		if (isMainFrame) {
			console.info('Failed To Load Script',JSON.stringify(ev, errorCode, errorDescription, url, isMainFrame, fProcessId));
			console.info('Loading URL Again: ', url);
			url = url ?? window.webContents.getURL();
			window.loadFile(config.config.retryPagePath);
			config.programManger.urlWhereLoadFailed = url;
			config.programManger.strictMode = false;
			return;
		}
	});
	window.webContents.on('did-navigate', (ev, url) => {
		console.info('url Change ', url);
		window.setAlwaysOnTop(true,'screen-saver');
		if(url.indexOf('login') !== -1 && url.indexOf('/test/') === -1) {
			app.quit();
			return ;
		}

		if( url.indexOf('/test/completed') !== -1 ) {
			config.programManger.strictMode = false;
			return ;
		}
		const key = 'electronApp';
		const value = true;
		config.programManger.mainWindow?.webContents.executeJavaScript(`
			localStorage.setItem('${key}', '${value}');
		`);
	});
}

//--FILE-SEPARATOR--

const testHandler = require('./testHandler')

module.exports = {
    testHandler
}

//--FILE-SEPARATOR--

const { BrowserWindow, dialog, webFrame, systemPreferences, app } =  require('electron');
const log = require('electron-log');
const path = require('path');
const os = require('os');

console = log;

const config = require('../config');
const handler = require('../handler');
const { is } = require('@electron-toolkit/utils');

const isMac = os.platform() === 'darwin';

/**
 * 
 * @param {BrowserWindow} window 
 * @returns 
 */
function ensureFullScreen(window) {
    if (window.isFullScreen() || window.isSimpleFullScreen()) return;
    if (isMac) {
        window.setSimpleFullScreen(true);
    } else {
        window.setFullScreen(true);
    }
}

function testWindow(link) {
    /**
     * @type {import('electron').BrowserWindow | undefined}
     */
    let window;
    try {
        /** @type {import('electron').BrowserWindowConstructorOptions} */
        const windowContractorConfig = {
            frame:false,
            kiosk:true,
            alwaysOnTop:true,
            closable: true,
            resizable: false,
            show: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: true,
                devTools: false,
                preload: path.join( __dirname,"../preload/testWindow.js"),
            },
        }
        windowContractorConfig.frame = true;
        windowContractorConfig.kiosk = false;
        if ( is.dev && (config.env == 'local' || config.env === 'testing') ) {
            windowContractorConfig.webPreferences.devTools = true;
        }
        window = new BrowserWindow(windowContractorConfig);
        window.loadURL(link);
        window.setContentProtection(true);
        window.setVisibleOnAllWorkspaces(true, {
            visibleOnFullScreen: true,
        });
        if ( is.dev && (config.env == 'local' || config.env === 'testing') ) {
            window.webContents.openDevTools();
        }

        const intervalId = setInterval(() => {
            try {
                if (window.isDestroyed()) {
                    clearInterval(intervalId);
                    return;
                }
                ensureFullScreen(window);
            } catch (error) {
                console.error(error);
            }
        }, 5000);

        window.on('blur', () => {
            console.log("low ping");
            setTimeout(() => {
                if (!window.isDestroyed()) {
                    if (process.platform === 'win32') {
                        window.setAlwaysOnTop(true, isMac ? 'floating' : 'screen-saver', 1);
                        window.moveTop();
                    }
                    window.focus();
                    ensureFullScreen(window);
                }
            }, 50);
        });

        window.webContents.once('did-finish-load', () => {
            window.setAlwaysOnTop(true, isMac ? 'floating' : 'screen-saver');
            ensureFullScreen(window);
        });

        window.once('show', () => {
            if (isMac) app.focus({ steal: true });
        });

        window.on('enter-full-screen', () => {
            if (isMac) setTimeout(() => app.focus({ steal: true }), 100);
        });

        if (isMac) {
            window.once('focus', () => {
                console.log("high ping");
                try {
                    const gestureBlocker = require('gesture-block');
                    gestureBlocker.startExamMode().catch((err) => {
                        console.error('[GestureBlock] Failed to start:', err);
                    });
                } catch (err) {
                    console.error('[GestureBlock] Module load error:', err);
                }
            });
        }

        try {
            handler.testHandler(window);
        } catch (error) {
            console.error("ERRRORRR: ", error?.message);
        }
        return window;
    } catch (error) {
        console.error("ERRRORRR: ", error?.message);
        if (window) {
            window.close();
        }
    }
    
}

module.exports = testWindow;


//--FILE-SEPARATOR--

const { BrowserWindow, dialog, webFrame, systemPreferences } =  require('electron');
const log = require('electron-log');
const path = require('path');

console = log;

function macOsWindow() {
	/** @type {import('electron').BrowserWindowConstructorOptions} */
	const windowContructorConfig = {
		frame:false,
		closable: true,
		resizable: false,
		webPreferences: {
			width:  100,
			height: 100,
			nodeIntegration: true,
			devTools: false,
			preload: path.join( __dirname,"../public/preload/testWindow.js"),
			contextIsolation: true
		},
	}
    const window = new BrowserWindow(windowContructorConfig);
    window.loadFile('public/html/macPrompt.html');
	window.setSize(500, 700, false);
}

module.exports = macOsWindow;

//--FILE-SEPARATOR--

const { BrowserWindow } =  require('electron');
const log = require('electron-log');
const path = require('path');
const { is } = require('@electron-toolkit/utils');

console = log;

const config = require('../config');

function testWindow() {
    /** @type {import('electron').BrowserWindowConstructorOptions} */
    const windowContractorConfig = {
        frame:false,
        alwaysOnTop:false,
        closable: true,
        resizable: true,
        fullscreen: false,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
            devTools: false,
            preload: path.join( __dirname,"../preload/testLinkWindow.js"),
        },
    }
    if ( !is.dev && (config.env == 'local' || config.env == 'testing')) {
        windowContractorConfig.frame = true;
        windowContractorConfig.kiosk = false;
        windowContractorConfig.webPreferences.devTools = true;
    }
    const window = new BrowserWindow(windowContractorConfig);
    window.setContentProtection(true);
    if ( is.dev && (config.env == 'local' || config.env === 'testing')) {
        window.webContents.openDevTools();
    }
    window.webContents.on('did-finish-load', () => {
        window.maximize();
        window.show();
    });
    const rendererToChoose = config.config.isChitkara ? 'chitkara' : 'cq';
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        const url = process.env['ELECTRON_RENDERER_URL'] + '/' + rendererToChoose + '/';
        console.log('Loading URL:', url);
        window.loadURL(url);
    } else {
        const fileLocation = path.join(__dirname, '..', 'renderer/', rendererToChoose, '/index.html');
        console.log('Loading file:', fileLocation);
        window.loadFile(fileLocation);
    }
    return window;
}

module.exports = testWindow;

//--FILE-SEPARATOR--


const UpdateWindow = require('./updateWindow');
const TestWindow = require('./testWindow');
const MacPermissionWindow = require('./macOsPermission');
const TestLinkWindow = require('./testLinkWindow');

module.exports = {
    UpdateWindow,
    TestWindow,
    MacPermissionWindow,
    TestLinkWindow,
}

//--FILE-SEPARATOR--

const { config } = require('../../config');
const { BrowserWindow } = require('electron');
const console = require('electron-log');
const { is } = require('@electron-toolkit/utils'); 
const path = require('path');

module.exports = class FlashScreen {

    /**
     * @type {BrowserWindow}
     */
    #window

    /**
     * @type {BrowserWindow}
     */
    #loadingWindow

    /**
     * @type {windowOpenedSuccessfully}
     */
    #isWindowLoaded = false;

    /**
     * 
     * @param {BrowserWindow} window 
     * @param {{ onError: ({ errorCode: number, errorDescription: string }) => void, onClose: () => void, onLoadComplete: () => void}, customFlashScreen?: import('electron').BrowserWindow}
     */
    constructor(window, { onError,onClose, onLoadComplete}, customFlashScreen) {
        this.#window = window;
        this.#window.hide();
        this.#loadingWindow = customFlashScreen ?? this.constructLoadingScreen();
        this.#window.webContents.once('did-fail-load', (ev, errorCode, errorDescription) => {
            if (this.#isWindowLoaded) {
                return
            }
            try {
                this.#loadingWindow?.close();
                ev.preventDefault();
                onError({
                    errorCode,
                    errorDescription,
                });
            } catch (error) {
                console.error(error);
            }
        });
        this.#window.webContents.once('did-finish-load', () => {
            try {
                if (onLoadComplete) {
                    onLoadComplete();
                }
                this.#window.show();
                this.#isWindowLoaded = true;
                this.#loadingWindow?.close();
            } catch (error) {
                console.error(error);
            }
        });
        if (!this.#window.webContents.isLoading()) {
            try {
                this.#loadingWindow?.close();
                this.#isWindowLoaded = true;
                this.#window.show();
                onLoadComplete();
                return;
            } catch (error) {
                console.error(error);
            }
        }
        this.#loadingWindow.once('closed', () => {
            if (!this.#isWindowLoaded) {
                onClose();
            }
        });
    }

    constructLoadingScreen() {
        const window = new BrowserWindow({
            frame: false,
            width: 300,
            height: 300,
            alwaysOnTop: false,
            show: false,
            webPreferences: {
                devTools: false,
                nodeIntegration: true,
                contextIsolation: false,
            }
        });

        window.webContents.on('did-finish-load', () => {
            window.show();
        });

    const rendererToChoose = config.isChitkara ? 'chitkara' : 'cq';
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        const url = process.env['ELECTRON_RENDERER_URL'] + '/' + rendererToChoose + '/';
        console.log('Loading URL:', url);
        window.loadURL(url);
    } else {
        const fileLocation = path.join(__dirname, '..', 'renderer/', rendererToChoose, '/index.html');
        console.log('Loading file:', fileLocation);
        window.loadFile(fileLocation);
    }
        return window;
    }
}

//--FILE-SEPARATOR--

module.exports = {
    'FlashScreen': require('./flash-screen'),
}

//--FILE-SEPARATOR--

const os = require('os');
const { ipcMain, app, desktopCapturer, powerMonitor, session } = require('electron');
const console = require('electron-log');
const { keys } = require('../config/config');

const libs = require('../libs');
const handler = require('../handler');
const { FlashScreen } = require('../libs/flash-screen');
const { pushIntoUploadQueue, getUploadId, forceUploadFiles } = require('../libs/upload');

const { programManger } = require('../config');
const config = require('../config');
const path = require('path');
const { TestWindow } = require('../screen');

const crypto = require('node:crypto');

ipcMain.on('get-app-packed', async (ev) => {
	ev.returnValue = app.isPackaged;
});

ipcMain.on('update-app-config', async () => {
	programManger.updateConfigFromServer();
	return;
});

ipcMain.handle('startQuiz', async (ev, link, ...args) => {
	link = libs.utils.parseLink(link);
	if (link && programManger.mainWindow) {
		programManger.quizLink = link;
		const newWindow = TestWindow(link);
		new FlashScreen(newWindow, {
			onLoadComplete: () => {
				console.info('Load complete should show the window and hide');
				programManger.mainWindow = newWindow;
			},
			onError: () => {
				console.info('Load complete should show the window and hide');
				programManger.mainWindow.webContents.send('window-load-failed');
			},
			onClose: () => {
				console.info('Closing Event Happend');
				app.exit();
			}
		}, programManger.mainWindow);
		return true;
	}
	return false;
})

ipcMain.on('_quizURL', (ev) => {
	const url = config.config.QUIZ_SERVER;
	ev.returnValue = url;
})

ipcMain.on('_close-instructions', (ev) => {
	const command = (os.platform() == 'darwin')?'Command+Q':'Alt+F4'
	let string = `To exit please press ${command}, only when test has not been started.`;
	ev.returnValue = string;
})

ipcMain.on('_app-version', (ev) => {
	const version = app.getVersion();
	ev.returnValue = version;
})

ipcMain.on('_jitsi-constants', (ev) => {
	const meetJsConstants = programManger.getJitsiConfig();
	ev.returnValue = meetJsConstants;
})

ipcMain.on('_set-jitsi-constants', (ev, data) => {
	programManger.setJitsiConfig(data);
	ev.returnValue = true;
})

ipcMain.on('_close', async () => {
	programManger.mainWindow?.close();
})

ipcMain.on('_zoom-event', (event, value) => {
	programManger.zoomChange( (value + 100) / 100 );
})

ipcMain.on('_quiz-status', (event, value) => {
	console.info('quiz status ', value);
})

ipcMain.on('_pre-login-test', (event, value) => {
	try {
		if (typeof value == 'boolean') {
			programManger.preStartCheck(value);
		}
		console.debug(`Value got for pre-login-test:\t`, value);
	} catch (error) {
		console.info(error);
	}
})

ipcMain.on('_change-closeable-state', async (event, value) => {
	try {
		if( typeof value === 'boolean') {
			programManger.strictMode = !value;
		}
		console.debug(value);
		console.debug(`Change closeable state to ${value}`)
		console.info(`AllowClose change: ${value}`);	
	} catch (error) {
		console.info(error);
	}
})


ipcMain.on('_retryMultiScreen', async (event, value) => {
	try {
		await config.programManger.retry();
	} catch (error) {
		console.info(error);
	}
})

ipcMain.on('_quizId', async (event, value) => {
	try {
		config.programManger.setQuizId(value);
	} catch (error) {
		console.error(error);
	}
});


ipcMain.on('_userId', async (event, value) => {
	try {
		config.programManger.setUserId(value);
	} catch (error) {
		console.error(error);
	}
});

ipcMain.on('_appPath', (ev) => {
	ev.returnValue = app.getPath('exe');
	return;
})

ipcMain.handle('_checkIfVM', async (ev) => {
	try {
		const result  = await programManger.checkIfVM();
		return result;
	} catch (error) {
		console.error(error);
		return error;
	}
})
ipcMain.on('_listDevices', async (ev) => {
	const displayData = await desktopCapturer.getSources({
		types: ['screen'],
	})
	ev.returnValue = displayData;
})

ipcMain.on('_getRecordingPath', async (ev, quizId, userId) => {
	ev.returnValue = libs.utils.getPathForRecording({quizId, userId});
	return ev.returnValue;
})

ipcMain.on('_uploadFile', async (ev, id) => {
	pushIntoUploadQueue(id);
	return true;
})

ipcMain.on('_getUploadId', async (ev, data) => {
	try {
		if (!data.quizId || !data.path || !data.userId || !data.weightTime) {
			throw new Error('Payload is not valid');
		}
		const id = await getUploadId(data);
		ev.returnValue = id;
		return id;
	} catch (error) {
		console.error(error);
		ev.returnValue = {error: error?.message ?? error};
		return {error: error?.message ?? error};
	}
});

ipcMain.on('_open-url', async (ev, url) => {
	programManger.mainWindow.loadURL(url);
	return url;
});

ipcMain.handle('_upload-all-files', async (ev, data) => {
	try {
		const { quizId, userId } = data;
		console.log('Forcing upload of all files for quizId:', quizId, 'userId:', userId);
		await forceUploadFiles(userId, quizId);
		console.log('All files uploaded complete');
		return {message: 'success'}
	} catch (error) {
		console.error(error);
		ev.returnValue = {error: error?.message ?? error};
		return {error: error?.message ?? error};
	}
});

ipcMain.on('_retry-page-load', async (ev, data) => {
	try {
		console.log('Retrying fetching page');
		programManger.retryPageLoad();
		return true;
	} catch (error) {
		console.error(error);
		return { error: error?.message ?? error };
	}
});

ipcMain.on('_app-key', async (ev, data) => {
	try {
		const algorithm = 'aes-128-ctr';
		const password = Buffer.from('1f8e6d37a4b8dcd06a3cbf88c7eec7f2', 'hex'); // Convert hex string to Buffer
		const iv = Buffer.from('fbb9f284c3d9da3ac8b52e6f5bc7c248', 'hex');     // Convert hex string to Buffer
		const key = "This-Is-Temp-Key-Random-Random-TWO-Random";
		function encrypt(text) {
			var cipher = crypto.createCipheriv(algorithm, password, iv);
			var crypted = cipher.update(text, 'utf8', 'hex')
			crypted += cipher.final('hex');
			return crypted;
		}

		const finalKey = key;
		const enc = encrypt(finalKey);
		ev.returnValue = enc;
		return enc;
	} catch (error) {
		console.error(error);
		return { error: error?.message ?? error };
	}
});

let lockedAt = null;

powerMonitor.on('lock-screen', (ev) => {
	const mainWindow = programManger.mainWindow;
	lockedAt = Date.now();
	if (mainWindow) {
		mainWindow.webContents.send('lock-screen');
	}
});

powerMonitor.on('suspend', (ev) => {
	const mainWindow = programManger.mainWindow;
	lockedAt = Date.now();
	if (mainWindow) {
		mainWindow.webContents.send('lock-screen-event');
	}
});

powerMonitor.on('unlock-screen', (ev) => {
	const mainWindow = programManger.mainWindow;
	if (mainWindow) {
		if (lockedAt) {
			mainWindow.webContents.send('lock-screen-event', lockedAt);
			lockedAt = null;
		}
		mainWindow.webContents.send('unlock-screen-event');
	}
});

powerMonitor.on('resume', (ev) => {
	const mainWindow = programManger.mainWindow;
	if (mainWindow) {
		if (lockedAt) {
			mainWindow.webContents.send('lock-screen-event', lockedAt);
			lockedAt = null;
		}
		mainWindow.webContents.send('unlock-screen');
	}
});

ipcMain.handle('_decode-payload', async (ev, payload) => {
	let res = await libs.utils.decodePayload(payload?.payload ?? payload);
	return res;
});

ipcMain.handle('_encrypt-payload-v2', async (ev, payload) => {
	try {
		const toEncrypt = programManger.needEncryption();
		if (!toEncrypt) {
			return { headers: {}, payload };
		}
		try {
			payload.deviceSecret = programManger.deviceSecret;
			payload.elevationStatus = programManger.eleveationSenario;
			payload.checksum = await programManger.checksum();
		} catch (err) {}

		return libs.utils.encodePayload(payload, keys.sharedTx);
	} catch (err) {
		console.error('Error in encryption v2:', err);
		return { error: err?.message ?? err };
	}
});

ipcMain.handle('_encrypt-payload', (ev, payload) => {
	const toEncrypt = programManger.needEncryption();
	if (!toEncrypt) {
		return { headers: {}, payload };
	}

	return libs.utils.encodePayload(payload, keys.sharedTx);
});

ipcMain.handle('_remote-action', (ev, data) => {
	try {
		programManger.remoteActions.execute(data);
	} catch (error) {
		console.error(error);
	}
});

//--FILE-SEPARATOR--

const log = require('electron-log');
log.transports.file.fileName = "app.log";
console = log;
const { app, dialog, Menu, globalShortcut, systemPreferences, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const config = require('./config');
const libs = require('./libs');
const { startUploadQueue, initDataBase } = require('./libs/upload');

const screen = require('./screen');
const { FlashScreen } = require('./libs/flash-screen');

const scheme = (config.config.isChitkara) ? 'testpad-chitkara' : 'test-codequotient';
app.commandLine.appendSwitch('disable-features', 'IOSurfaceCapturer', 'DesktopCaptureMacV2');

if (process.defaultApp) {
	if (process.argv.length >= 2) {
		app.setAsDefaultProtocolClient(scheme, process.execPath, [path.resolve(process.argv[1])])
	}
} else {
	app.setAsDefaultProtocolClient(scheme)
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
	console.error(new Error('Unable to get lock for the instance.'));
	return app.quit();
}

if (os.platform() !== 'darwin') {
	app.on('second-instance', (event, commandLine, workingDirectory) => {
		// Someone tried to run a second instance, we should focus our window.
		const window = config.programManger.mainWindow;
		if (window) {
			if (window.isMinimized()) window.restore();
		}
		const link = libs.utils.parseLink(commandLine.pop().split(`${scheme}://`)[1]);
		if (link && window) {
			window.webContents.send('url', link);
		}
	})
}

if (app.isPackaged && config.env !== 'testing') {
	Menu.setApplicationMenu(null);
}

console.info('App starting...');
app.commandLine.appendSwitch('disable-features', 'IOSurfaceCapturer', 'DesktopCaptureMacV2');
app.whenReady().then(async () => {
	try {
		const oldDebugDir = path.join(app.getPath('logs'), "tempering-debug");
		fs.rmSync(oldDebugDir, { recursive: true, force: true });
	} catch (ex) {
		console.error(`[detect] Failed to clean old debug directory:`, ex);
	}

	try {
		await config.programManger.initApp();
	} catch (error) {
		console.error('Unable to init crypto key exchange', error);
	}
	globalShortcut.register('Ctrl+=', () => {
		config.programManger.zoomChange(true);
	});

	console.log("USER NAME: ", process.env.USERNAME);

	globalShortcut.register('Ctrl+-', () => {
		config.programManger.zoomChange(false);
	})

	if (os.platform() === 'darwin') {
		globalShortcut.register('Command+Q', () => {
			app.quit();
		});
	}

	const dataPath = app.getPath('userData');

	startUploadQueue();
	const isMinimumSpaceRequiredAvailable = await config.programManger.checkForDiskSpaceForRecording(config.minimumDiskSpaceRequired);
	if (!isMinimumSpaceRequiredAvailable) {
		dialog.showMessageBoxSync(null, {
			title: 'Low Disk Space',
			buttons: ['ok'],
			message: `Your system does not have minimum space required at ${app.getPath('temp')}.\nPlease free some space there before opening app again.`,
			icon: path.join(config.logoPath),
		});
		process.exit();
	}

	try {
		if (app.isPackaged) {
			try {
				await screen.UpdateWindow();
			} catch (error) {
				console.info(error);
				let message = error?.message ?? error;
				if (os.platform() == 'darwin') {
					message += '\nPlease install the app in the application folder for automatic updates to function properly.'
				}
				throw new Error(message)
			}
		}
		try {
			await config.programManger.checkElevationStatus();
		} catch (error) {
			console.error('Error while getting elevation permisssion', error);
		}
		await initDataBase();
		if (os.platform() === 'darwin' && app.isPackaged) {
			const isMonitorOn = await config.programManger.startMonitoringApp();
			if (!isMonitorOn) {
				dialog.showMessageBoxSync(null, {
					title: 'Please Provide Required Permission',
					buttons: ['ok'],
					message: `Without required permission ${app.name} will not start`,
					icon: path.join(config.logoPath),
				})
				return app.quit();
			}
			setInterval(async () => {
				try {
					const isWorking = await config.programManger.checkForMonitor();
					console.info(`Monitoring App check run at ${new Date().toISOString()} with result ${isWorking}`);
				} catch (error) {
					console.error(error);
				}
			}, 10 * 1000);
		}

		if (!config.programManger.quizLink) {
			config.programManger.quizLink = libs.utils.parseLink(process.argv[process.argv.length - 1].split(`${scheme}://`)?.[1]);
		}

		if (os.platform() === 'darwin') {
			const isCameraAvailable = await systemPreferences.askForMediaAccess('camera');
			console.info('Camera Permission', isCameraAvailable);
			if (!isCameraAvailable) {
				dialog.showMessageBoxSync(null, {
					title: 'Please Provide Access To Camera.',
					buttons: ['ok'],
					message: `Without camera access the app will not start.\nYou can allow by going to the Privacy Setting/Camera and allow ${app.name}`,
					icon: path.join(config.logoPath)
				});
				return app.quit();
			}
		}

		if (os.platform() === 'darwin') {
			try {
				const gestureBlocker = require('gesture-block');
				const hasAccessibility = gestureBlocker.checkPermission();
				if (!hasAccessibility) {
					const { shell } = require('electron');
					const response = dialog.showMessageBoxSync(null, {
						type: 'warning',
						title: 'Accessibility Permission Required',
						message: `${app.name} requires Accessibility permission to function properly.`,
						detail: 'Go to System Settings → Privacy & Security → Accessibility, enable this app, then restart.',
						buttons: ['Open Settings', 'Quit'],
						defaultId: 0,
						cancelId: 1,
						icon: path.join(config.logoPath),
					});
					if (response === 0) {
						shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
					}
					return app.quit();
				}
			} catch (error) {
				console.error('[GestureBlock] Accessibility check failed:', error?.message);
			}
		}

		const filePath = path.join(dataPath, 'config.json');
		if (!fs.existsSync(filePath)) {
			console.info("APP INSTALLED FOR FIRST TIME");
			fs.writeFileSync(filePath, 'App installed');
			dialog.showMessageBoxSync(null, {
				title: 'App installed successfully.',
				buttons: ['ok'],
				message: 'App has been installed successfully.\nPlease refresh test window to open test in app.',
				icon: path.join(config.logoPath)
			});
			return app.quit();
		}

		try {
			await config.programManger.beforeAppStart();
		} catch (error) {
			config.programManger.notify({
				title: 'Please Note',
				body: `${error?.message ?? 'Something went wrong.'}`
			})
			dialog.showMessageBoxSync(null, {
				title: 'Multiple windows detected.',
				buttons: ['ok'],
				message: 'Some test can show error if multiple windows are connected.',
				icon: path.join(config.logoPath)
			});
		}

		if (app.isPackaged && !config.programManger.quizLink) {
			const linkPath = path.join(dataPath, 'previouslink.txt');
			if (fs.existsSync(linkPath)) {
				config.programManger.quizLink = fs.readFileSync(linkPath).toString();
				fs.rmSync(linkPath);
			}
		}

		if (config.env !== 'production') {
			config.programManger.notify({
				title: config.programManger.getPlatformName(),
				body: `Running app in ${config.env}`
			})
		}
		console.log("APP LOADED");
		if (config.programManger.quizLink) {
			const testWindow = screen.TestWindow(config.programManger.quizLink);
			config.programManger.mainWindow = testWindow;
			new FlashScreen(testWindow, {
				onError: () => {
					console.error(`Error while loading the window.`);
					const response = dialog.showMessageBoxSync({
						title: "Internet connectivity problem",
						message: "Unable to load application, please check your internet connection.",
						buttons: ["cancel", "retry"],
						icon: path.join(config.logoPath),
					});
					if (response === 1) {
						const linkPath = path.join(app.getPath('userData'), 'previouslink.txt');
						fs.writeFileSync(linkPath, config.programManger.quizLink);
						app.relaunch();
					}
					app.quit();
				},
				onClose: () => {
					app.exit();
				}
			});
		} else {
			const testLinkWindow = screen.TestLinkWindow();
			config.programManger.mainWindow = testLinkWindow;
		}

	} catch (error) {
		dialog.showErrorBox('Something went wrong', error?.message);
		console.info(error);
		app.quit()
	}

	Menu.setApplicationMenu(Menu.buildFromTemplate([
		{
			label: "Application",
			submenu: [
				{ type: "separator" },
				{ label: "Quit", accelerator: "Command+Q", click: function () { app.quit(); } }
			]
		}, {
			label: "Edit",
			submenu: [
				{ label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
				{ label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
				{ type: "separator" },
				{ label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
				{ label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
				{ label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
				{ label: "Select All", accelerator: "CmdOrCtrl+A", selector: "selectAll:" }
			]
		},
		...(config.env !== 'production' ? [{
			label: "Debug",
			submenu: [
				{
					label: "Show Logs Path",
					click: function () {
						const logsPath = app.getPath('logs');
						dialog.showMessageBox(null, {
							title: 'Logs Path',
							message: 'Logs are stored at:',
							detail: logsPath,
							buttons: ['OK', 'Copy Path'],
						}).then(({ response }) => {
							if (response === 1) {
								clipboard.writeText(logsPath);
							}
						});
					}
				}
			]
		}] : [])
	])
	)
})

app.on('open-url', (event, url) => {
	const window = config.programManger.mainWindow;
	const link = libs.utils.parseLink(url.split(`${scheme}://`)[1]);
	console.info('URL', link, url);
	if (window) {
		console.info('Window Exists Maximizing');
		if (window.isMinimized()) window.restore();
		window.focus();
		if (link && window) {
			window.webContents.send('url', link);
		}
	}
	if (link && !config.programManger.quizLink) {
		// process.argv.push(url)
		config.programManger.quizLink = link;
	}

})

app.on('will-quit', async () => {
	try {
		if ('closeMonitor' in config.programManger) {
			await config.programManger.closeMonitor();
		}
	} catch (error) {
		console.log(error);
	}
})

app.on('window-all-closed', () => {
	if ('removeConfig' in config.programManger) {
		config.programManger.removeConfig();
	}
	app.quit();
});


require('./handler/ipc');

//--FILE-SEPARATOR--

const { app } = require('electron');
const path = require('path');
let isMonitoringApp = false;
const log = require('electron-log');
log.transports.file.resolvePathFn = () => path.join(APP_DATA, 'logs/index.log');

console.log("App starting with args: ", process.argv);

for (let index = 0; index < process.argv.length; ++index) {
	console.log(process.argv[index]);
	if (process.argv[index].trim() === 'monitoringMode') {
		if (process.argv?.[index +1] && !isNaN(Number(process.argv[index + 1]))) {
			process.monitorPort = Number(process.argv[index + 1]);
		} else {
			process.monitorPort = 8179;
		}
		process.argv.splice(0, index);
		isMonitoringApp = true;
		process.argv = [process.argv.slice(0, index), ...process.argv.splice(index + 1)];
		break;
	}
}

if (app.name === 'testpad') {
	app.name = 'Testpad';
}

if (isMonitoringApp) {
	require('./monitor');
} else {
	require('./parent');
}


//--FILE-SEPARATOR--

import { getDefaultExportFromCjs } from " commonjsHelpers.js";
import { __require as requireMain } from "D:/a/test_electron/test_electron/src/main/index.js";
var mainExports = requireMain();
export { mainExports as __moduleExports };
export default /*@__PURE__*/getDefaultExportFromCjs(mainExports);
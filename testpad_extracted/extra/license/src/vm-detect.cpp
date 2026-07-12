#if defined(__aarch64__) || defined(__arm64__) || defined(_M_ARM64)
static inline unsigned int _mm_crc32_u8(unsigned int crc, unsigned char data)
{
	crc ^= static_cast<unsigned int>(data);
	for (int i = 0; i < 8; ++i)
	{
		crc = (crc >> 1) ^ ((crc & 1U) ? 0x82F63B78U : 0U);
	}
	return crc;
}
#endif

#include <vector>
#include <sstream>
#include <iostream>
#include <string>
#include "vmaware.hpp"
#include "vm_reason.hpp"
#include "parent_process.hpp"
#include "aes-gcm.hpp"
#include "json.hpp"

static std::string sanitize_utf8(const std::string &in)
{
	std::string out;
	out.reserve(in.size());
	const unsigned char *s = reinterpret_cast<const unsigned char *>(in.data());
	size_t i = 0, n = in.size();

	while (i < n)
	{
		unsigned char c = s[i];
		if (c < 0x80)
		{
			out.push_back((char)c);
			++i;
			continue;
		}
		size_t expected = 0;
		if ((c & 0xE0) == 0xC0)
			expected = 2;
		else if ((c & 0xF0) == 0xE0)
			expected = 3;
		else if ((c & 0xF8) == 0xF0)
			expected = 4;
		else
		{
			out.append("\xEF\xBF\xBD");
			++i;
			continue;
		}
		if (i + expected > n)
		{
			out.append("\xEF\xBF\xBD");
			break;
		}
		bool ok = true;
		for (size_t k = 1; k < expected; ++k)
		{
			unsigned char cc = s[i + k];
			if ((cc & 0xC0) != 0x80)
			{
				ok = false;
				break;
			}
		}
		if (!ok)
		{
			out.append("\xEF\xBF\xBD");
			++i;
			continue;
		}
		for (size_t k = 0; k < expected; ++k)
			out.push_back((char)s[i + k]);
		i += expected;
	}

	return out;
}

inline const std::string EncryptionKey()
{
	static const unsigned char obfuscated[] = {0x2F, 0x7D, 0x7E, 0x7E, 0x2F, 0x2D, 0x7D, 0x2B, 0x2F, 0x7B, 0x78, 0x2F, 0x7C, 0x28, 0x7C, 0x7B, 0x2F, 0x7A, 0x2B, 0x7D, 0x7D, 0x28, 0x7A, 0x2D, 0x2B, 0x2C, 0x7F, 0x7F, 0x7E, 0x77, 0x7B, 0x7E};
	std::string result;
	for (auto b : obfuscated)
		result += (char)(b ^ 0x4E);
	return result;
}

std::string hashChallenge(const std::string &input)
{
	uint64_t hash = 1469598103934665603ULL;
	for (unsigned char c : input)
	{
		hash ^= (uint64_t)c;
		hash *= 1099511628211ULL;
	}
	std::stringstream ss;
	ss << std::hex << hash;
	return ss.str();
}

static std::string encryptText(const std::string &input, const std::string encryptionKey, const std::string &hashedChallenge)
{
	std::string keySeed = encryptionKey + hashedChallenge;
	return aesGcmEncrypt(input, keySeed);
}

static bool isDebugMode(int argc, char *argv[], const std::string encryptionKey)
{
	if (argv[3] != nullptr && std::string(argv[3]) == encryptionKey)
	{
		return true;
	}
	return false;
}

int main(int argc, char *argv[])
{
	try
	{
		const std::string encryptionKey = EncryptionKey();
		const bool debugMode = isDebugMode(argc, argv, encryptionKey);

		if (argc < 3 || argv[1] == nullptr || argv[2] == nullptr)
		{
			return 2; // expects: <parentPid> <challenge>
		}

		if (!debugMode)
		{
			try
			{
				ParentProcess::ProcessId parentPid = static_cast<ParentProcess::ProcessId>(std::stoull(argv[1]));

				if (!ParentProcess::isValidParent(parentPid))
				{
					return 0; // parent process check failed
				}
			}
			catch (...)
			{
				return 2; // invalid PID argument
			}
		}

		bool is_vm = VM::detect(VM::HIGH_THRESHOLD, VM::DISABLE(VM::TIMER));
		uint8_t vm_pct = VM::percentage(VM::HIGH_THRESHOLD, VM::DISABLE(VM::TIMER));
		unsigned int detected_count = VM::detected_count();
		std::vector<VM::enum_flags> detected_flags = VM::detected_enums();

		// Avoid VM::vmaware default constructor to bypass potential zero-size array template issue
		// Use VM static helpers instead
		std::string vm_type = VM::type();
		std::string vm_brand = VM::brand();
		std::string vm_conclusion = VM::conclusion();

		nlohmann::json json_output;
		json_output["isVM"] = is_vm;
		json_output["type"] = sanitize_utf8(vm_type);
		json_output["brand"] = sanitize_utf8(vm_brand);
		json_output["conclusion"] = sanitize_utf8(vm_conclusion);
		json_output["percentage"] = static_cast<int>(vm_pct);
		json_output["numberOfTechDetected"] = static_cast<int>(detected_count);
		json_output["flagsThatFailed"] = nlohmann::json::array();

		for (const auto &flag : detected_flags)
		{
			std::string flagName = VM::flag_to_string(flag);
			std::string reason_raw = vmreason::GetFlagReport("VM::" + flagName);
			nlohmann::json entry;
			entry["flag"] = sanitize_utf8(flagName);
			entry["reason"] = sanitize_utf8(reason_raw);
			json_output["flagsThatFailed"].push_back(entry);
		}

		std::string challenge = argv[2];
		std::string hashedChallenge = hashChallenge(challenge);
		json_output["validator"] = hashedChallenge;

		std::string plain_json = json_output.dump();
		if (debugMode)
		{
			std::cout << plain_json << std::endl;
		}
		else
		{
			std::string encryptedText = encryptText(plain_json, encryptionKey, hashedChallenge);
			std::cout << encryptedText << std::endl;
		}
		return is_vm ? 1 : 0;
	}
	catch (const std::exception &e)
	{
		std::cerr << "Error during VM detection: " << e.what() << std::endl;
		return -1;
	}
	catch (...)
	{
		std::cerr << "Unknown error during VM detection." << std::endl;
		return -1;
	}
}

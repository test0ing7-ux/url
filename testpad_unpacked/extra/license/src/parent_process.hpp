#pragma once

#include <algorithm>
#include <cctype>
#include <string>

#if defined(_WIN32)
#include <windows.h>
#include <tlhelp32.h>
#else
#include <cerrno>
#include <csignal>
#include <sys/types.h>
#include <unistd.h>
#endif

namespace ParentProcess
{

	inline bool containsIgnoreCase(std::string haystack, std::string needle)
	{
		std::transform(haystack.begin(), haystack.end(), haystack.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
		std::transform(needle.begin(), needle.end(), needle.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
		return haystack.find(needle) != std::string::npos;
	}

#if defined(_WIN32)
	using ProcessId = DWORD;

	inline ProcessId getParentPid(ProcessId pid)
	{
		ProcessId parentPid = 0;
		HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
		if (snapshot == INVALID_HANDLE_VALUE)
		{
			return 0;
		}

		PROCESSENTRY32 pe;
		pe.dwSize = sizeof(PROCESSENTRY32);

		if (Process32First(snapshot, &pe))
		{
			do
			{
				if (pe.th32ProcessID == pid)
				{
					parentPid = pe.th32ParentProcessID;
					break;
				}
			} while (Process32Next(snapshot, &pe));
		}

		CloseHandle(snapshot);
		return parentPid;
	}

	inline std::string wideToUtf8(const std::wstring &wstr)
	{
		if (wstr.empty())
		{
			return "";
		}

		int sizeNeeded = WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), -1, nullptr, 0, nullptr, nullptr);
		if (sizeNeeded <= 0)
		{
			return "";
		}

		std::string result(sizeNeeded - 1, '\0');
		WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), -1, &result[0], sizeNeeded, nullptr, nullptr);
		return result;
	}

	inline std::string getParentProcessPath(ProcessId pid)
	{
		ProcessId parentPid = getParentPid(pid);
		if (parentPid == 0)
		{
			return "";
		}

		HANDLE hProcess = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, parentPid);
		if (!hProcess)
		{
			return "";
		}

		wchar_t pathBuf[MAX_PATH] = {0};
		DWORD size = MAX_PATH;
		std::string parentPath;

		if (QueryFullProcessImageNameW(hProcess, 0, pathBuf, &size))
		{
			parentPath = wideToUtf8(pathBuf);
		}

		CloseHandle(hProcess);
		return parentPath;
	}

	inline std::string getParentProcessPath()
	{
		return getParentProcessPath(GetCurrentProcessId());
	}

	inline bool isCurrentParent(ProcessId pid)
	{
		return pid != 0 && getParentPid(GetCurrentProcessId()) == pid;
	}

	inline bool isValidParent(ProcessId pid)
	{
		return isCurrentParent(pid);
	}
#else
	using ProcessId = pid_t;

	inline ProcessId getParentPid(ProcessId pid)
	{
		if (pid == getpid())
		{
			return getppid();
		}
		return 0;
	}

	inline std::string getParentProcessPath(ProcessId)
	{
		return "";
	}

	inline std::string getParentProcessPath()
	{
		return "";
	}

	inline bool processExists(ProcessId pid)
	{
		if (pid <= 1)
		{
			return false;
		}
		if (kill(pid, 0) == 0)
		{
			return true;
		}
		return errno == EPERM;
	}

	inline bool isCurrentParent(ProcessId pid)
	{
		return pid > 1 && getppid() == pid && processExists(pid);
	}

	inline bool isValidParent(ProcessId pid)
	{
		return isCurrentParent(pid);
	}
#endif

} // namespace ParentProcess

// vm_reason.cpp
// Complete cross-platform plain-text VM-reason probes
// Provides GetFlagReport(flagName) -> plain-text block with FLAG/PASS/RAW/REASON/NOTE
// Safe, low-priv probes only. Skips heavy privileged checks by design.

#include "vm_reason.hpp"
#include <sstream>
#include <iomanip>
#include <string>
#include <thread>
#include <vector>
#include <cstring>
#include <fstream>
#include <algorithm>
#include <chrono>

#if defined(_WIN32)
  #define NOMINMAX
  #include <windows.h>
  #include <winreg.h>
  #include <tlhelp32.h>
  #include <iphlpapi.h>
  #pragma comment(lib, "iphlpapi.lib")
  #pragma comment(lib, "pdh.lib")
#elif defined(__APPLE__)
  #include <sys/sysctl.h>
  #include <CoreFoundation/CoreFoundation.h>
  #include <IOKit/IOKitLib.h>
  #include <IOKit/IOKitKeys.h>
  #include <unistd.h>
#elif defined(__linux__)
  #include <unistd.h>
  #include <dirent.h>
  #include <glob.h>
  #include <sys/stat.h>
  #include <sys/types.h>
  #include <sys/utsname.h>
  #include <sys/syscall.h>
  #include <sys/time.h>
#endif

namespace vmreason {

// ----------------- helpers -----------------

static inline void cpuid_ex(unsigned leaf, unsigned subleaf, unsigned &eax, unsigned &ebx, unsigned &ecx, unsigned &edx) {
    #if defined(_MSC_VER) && (defined(_M_IX86) || defined(_M_X64))
    // MSVC on x86/x64
        int regs[4];
        __cpuidex(regs, (int)leaf, (int)subleaf);
        eax = (unsigned)regs[0]; ebx = (unsigned)regs[1];
        ecx = (unsigned)regs[2]; edx = (unsigned)regs[3];
    #elif (defined(__GNUC__) || defined(__clang__)) && (defined(__i386__) || defined(__x86_64__))
    // GCC/Clang on x86/x64
        __asm__ volatile ("cpuid"
                        : "=a"(eax), "=b"(ebx), "=c"(ecx), "=d"(edx)
                        : "a"(leaf), "c"(subleaf));
    #else
        // Non-x86 (e.g., arm64) — no CPUID; return zeros
        (void)leaf; (void)subleaf;
        eax = ebx = ecx = edx = 0;
    #endif
}

static std::string format_hex(unsigned v) {
    std::ostringstream ss;
    ss << "0x" << std::hex << v << std::dec;
    return ss.str();
}

static std::string read_small_file(const std::string& path) {
    std::ifstream f(path);
    if (!f.is_open()) return "";
    std::string s;
    std::getline(f, s);
    while (!s.empty() && (s.back()=='\n' || s.back()=='\r')) s.pop_back();
    return s;
}

static std::string skipped_report(const std::string& flag, const std::string& note) {
    std::ostringstream out;
    out << "FLAG: " << flag << "\n";
    out << "PASS: skipped\n";
    out << "RAW: <probe skipped>\n";
    out << "REASON: <insufficient privileges or unsupported platform>\n";
    out << "NOTE: " << note << "\n";
    return out.str();
}

// ----------------- Core probes (previously implemented) -----------------

// HYPERVISOR_BIT
static std::string probe_HYPERVISOR_BIT() {
    const std::string flag = "VM::HYPERVISOR_BIT";
#if defined(__i386__) || defined(__x86_64__) || defined(_M_X64) || defined(_M_IX86)
    unsigned a=0,b=0,c=0,d=0;
    cpuid_ex(1,0,a,b,c,d);
    bool bit31 = ((c >> 31) & 1) != 0;
    std::ostringstream out;
    out << "FLAG: " << flag << "\n";
    out << "PASS: " << (bit31 ? "true" : "false") << "\n";
    out << "RAW: leaf1.ecx=" << format_hex(c) << " bit31=" << (bit31?1:0) << "\n";
    out << "REASON: " << (bit31 ? "Hypervisor CPUID bit is set (ECX[31] == 1)." :
                            "Hypervisor CPUID bit is clear (ECX[31] == 0).") << "\n";
    out << "NOTE: x86/x64 only. If CPUID is unavailable, probe is skipped silently.\n";
    return out.str();
#else
    return skipped_report(flag, "Non-x86 platform (CPUID not available).");
#endif
}

// VMID (leaf 0)
static std::string probe_VMID() {
    const std::string flag = "VM::VMID";
#if defined(__i386__) || defined(__x86_64__) || defined(_M_X64) || defined(_M_IX86)
    unsigned a=0,b=0,c=0,d=0;
    cpuid_ex(0,0,a,b,c,d);
    char vendor[13] = {0};
    memcpy(vendor+0, &b, 4); memcpy(vendor+4, &d, 4); memcpy(vendor+8, &c, 4);
    std::string vstr(vendor);
    bool has = !vstr.empty() && vstr[0] != '\0';
    std::ostringstream out;
    out << "FLAG: " << flag << "\n";
    out << "PASS: " << (has ? "true" : "false") << "\n";
    out << "RAW: leaf0.vendor=\"" << vstr << "\"\n";
    out << "REASON: " << (has ? "CPUID leaf 0 vendor string present." : "No CPUID leaf0 vendor string.") << "\n";
    out << "NOTE: x86/x64 only.\n";
    return out.str();
#else
    return skipped_report(flag, "Non-x86 platform (CPUID not available).");
#endif
}

// VMID_0X4 (leaf 0x40000000)
static std::string probe_VMID_0X4() {
    const std::string flag = "VM::VMID_0X4";
#if defined(__i386__) || defined(__x86_64__) || defined(_M_X64) || defined(_M_IX86)
    unsigned a=0,b=0,c=0,d=0;
    cpuid_ex(0x40000000,0,a,b,c,d);
    char vendor[13] = {0};
    memcpy(vendor+0, &b, 4); memcpy(vendor+4, &c, 4); memcpy(vendor+8, &d, 4);
    std::string vstr(vendor);
    bool has = !vstr.empty() && vstr[0] != '\0';
    std::ostringstream out;
    out << "FLAG: " << flag << "\n";
    out << "PASS: " << (has ? "true" : "false") << "\n";
    out << "RAW: leaf0x40000000.vendor=\"" << vstr << "\"\n";
    out << "REASON: " << (has ? "Hypervisor vendor string discovered." : "No hypervisor vendor string.") << "\n";
    out << "NOTE: x86/x64 only.\n";
    return out.str();
#else
    return skipped_report(flag, "Non-x86 platform (CPUID not available).");
#endif
}

// CPUID_SIGNATURE (leaf 0x40000001)
static std::string probe_CPUID_SIGNATURE() {
    const std::string flag = "VM::CPUID_SIGNATURE";
#if defined(__i386__) || defined(__x86_64__) || defined(_M_X64) || defined(_M_IX86)
    unsigned a=0,b=0,c=0,d=0;
    cpuid_ex(0x40000001,0,a,b,c,d);
    std::ostringstream out;
    out << "FLAG: " << flag << "\n";
    out << "PASS: true\n";
    out << "RAW: eax=" << format_hex(a) << " ebx=" << format_hex(b) << " ecx=" << format_hex(c) << " edx=" << format_hex(d) << "\n";
    out << "REASON: CPUID leaf 0x40000001 read; values returned above. Compare vendor-specific signature strings to known hypervisors.\n";
    out << "NOTE: x86/x64 only. Interpretation requires pattern matching.\n";
    return out.str();
#else
    return skipped_report(flag, "Non-x86 platform (CPUID not available).");
#endif
}

// QEMU/BOCHS brand (CPU brand)
static std::string probe_QEMU_BRAND() {
    const std::string flag = "VM::QEMU_BRAND";
#if defined(__i386__) || defined(__x86_64__) || defined(_M_X64) || defined(_M_IX86)
    unsigned a,b,c,d;
    char s[49] = {0};
    cpuid_ex(0x80000002,0,a,b,c,d); memcpy(s+0,&a,4); memcpy(s+4,&b,4); memcpy(s+8,&c,4); memcpy(s+12,&d,4);
    cpuid_ex(0x80000003,0,a,b,c,d); memcpy(s+16,&a,4); memcpy(s+20,&b,4); memcpy(s+24,&c,4); memcpy(s+28,&d,4);
    cpuid_ex(0x80000004,0,a,b,c,d); memcpy(s+32,&a,4); memcpy(s+36,&b,4); memcpy(s+40,&c,4); memcpy(s+44,&d,4);
    std::string brand(s);
    bool found = (brand.find("QEMU") != std::string::npos) || (brand.find("Bochs") != std::string::npos);
    std::ostringstream out;
    out << "FLAG: " << flag << "\n";
    out << "PASS: " << (found ? "true" : "false") << "\n";
    out << "RAW: cpu_brand=\"" << brand << "\"\n";
    out << "REASON: " << (found ? "CPU brand string contains VM vendor tokens (QEMU/Bochs)." : "CPU brand string doesn't show QEMU/Bochs tokens.") << "\n";
    out << "NOTE: x86/x64 only.\n";
    return out.str();
#else
    return skipped_report(flag, "Non-x86 platform (CPUID not available).");
#endif
}

// INTEL_THREAD_MISMATCH (heuristic)
static std::string probe_INTEL_THREAD_MISMATCH() {
    const std::string flag = "VM::INTEL_THREAD_MISMATCH";
#if defined(__i386__) || defined(__x86_64__) || defined(_M_X64) || defined(_M_IX86)
    unsigned a=0,b=0,c=0,d=0;
    cpuid_ex(1,0,a,b,c,d);
    unsigned logical = ((b >> 16) & 0xff);
    unsigned hw = std::thread::hardware_concurrency();
    std::ostringstream out;
    bool mismatch = (hw != 0 && logical != 0 && hw != logical);
    out << "FLAG: " << flag << "\n";
    out << "PASS: " << (mismatch ? "true" : "false") << "\n";
    out << "RAW: hw_concurrency=" << hw << " cpuid_logical=" << logical << "\n";
    out << "REASON: " << (mismatch ? "Reported hardware thread count does not match CPUID-expected value; may indicate VM vCPU configuration." :
                                 "Thread counts match or not determinable; no mismatch evidence.") << "\n";
    out << "NOTE: heuristic; for better accuracy correlate with CPU model database.\n";
    return out.str();
#else
    return skipped_report(flag, "Non-x86 platform (thread mapping probe requires CPUID).");
#endif
}

// MSSMBIOS (SMBIOS / DMI)
static std::string probe_MSSMBIOS() {
    const std::string flag = "VM::MSSMBIOS";
#if defined(_WIN32)
    HKEY h;
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, "HARDWARE\\DESCRIPTION\\System\\BIOS", 0, KEY_READ, &h) != ERROR_SUCCESS)
        return skipped_report(flag, "Unable to read HKLM BIOS key (permission or missing).");
    auto readVal = [&](const char* name)->std::string {
        char buf[512]; DWORD type=0, size=sizeof(buf);
        if (RegGetValueA(h, nullptr, name, RRF_RT_REG_SZ, &type, buf, &size) == ERROR_SUCCESS) return std::string(buf);
        return std::string();
    };
    std::string vendor = readVal("BIOSVendor");
    std::string sysman = readVal("SystemManufacturer");
    std::string sysprod = readVal("SystemProductName");
    RegCloseKey(h);
    bool suspect = false;
    if (!sysman.empty() && (sysman.find("VMware")!=std::string::npos || sysman.find("VirtualBox")!=std::string::npos || sysman.find("Microsoft")!=std::string::npos)) suspect = true;
    std::ostringstream out;
    out << "FLAG: " << flag << "\n";
    out << "PASS: " << (suspect ? "true" : "false") << "\n";
    out << "RAW: SystemManufacturer=\"" << sysman << "\" SystemProductName=\"" << sysprod << "\" BIOSVendor=\"" << vendor << "\"\n";
    out << "REASON: " << (suspect ? "SMBIOS strings include known VM vendor substrings." : "No known VM vendor substrings in SMBIOS values.") << "\n";
    out << "NOTE: may require elevated privileges for full DMI.\n";
    return out.str();
#elif defined(__linux__)
    std::string sys_vendor = read_small_file("/sys/class/dmi/id/sys_vendor");
    std::string product = read_small_file("/sys/class/dmi/id/product_name");
    std::string bios = read_small_file("/sys/class/dmi/id/bios_vendor");
    bool suspect = false;
    if (!sys_vendor.empty() && (sys_vendor.find("VMware")!=std::string::npos || sys_vendor.find("QEMU")!=std::string::npos || sys_vendor.find("VirtualBox")!=std::string::npos)) suspect = true;
    std::ostringstream out;
    out << "FLAG: " << flag << "\n";
    out << "PASS: " << (suspect ? "true" : "false") << "\n";
    out << "RAW: sys_vendor=\"" << sys_vendor << "\" product_name=\"" << product << "\" bios_vendor=\"" << bios << "\"\n";
    out << "REASON: " << (suspect ? "DMI/SMBIOS strings contain known VM vendor tokens." : "No known VM vendor tokens found in DMI.") << "\n";
    out << "NOTE: reading /sys/class/dmi/id may be restricted for non-root on some distros.\n";
    return out.str();
#elif defined(__APPLE__)
    char model[256] = {0}; size_t len = sizeof(model);
    if (sysctlbyname("hw.model", model, &len, nullptr, 0) != 0) return skipped_report(flag, "sysctl(hw.model) unavailable.");
    std::string model_s(model);
    bool suspect = (model_s.find("VirtualBox")!=std::string::npos || model_s.find("VMware")!=std::string::npos || model_s.find("QEMU")!=std::string::npos);
    std::ostringstream out;
    out << "FLAG: " << flag << "\n";
    out << "PASS: " << (suspect ? "true" : "false") << "\n";
    out << "RAW: hw.model=\"" << model_s << "\"\n";
    out << "REASON: " << (suspect ? "hw.model contains known VM tokens." : "No VM strings in hw.model.") << "\n";
    out << "NOTE: IOKit inspection could provide more details.\n";
    return out.str();
#else
    return skipped_report(flag, "Unsupported platform for SMBIOS probe.");
#endif
}

// SETUPAPI_DISK - light placeholder
static std::string probe_SETUPAPI_DISK() {
    const std::string flag = "VM::SETUPAPI_DISK";
#if defined(_WIN32)
    std::ostringstream out;
    out << "FLAG: " << flag << "\n";
    out << "PASS: skipped\n";
    out << "RAW: <light probe; recommend Win32_DiskDrive WMI query for disk models/serial>\n";
    out << "REASON: Use Win32_DiskDrive Model/Caption to detect 'Virtual' or vendor tokens (VMware, VirtualBox, Msft Virtual Disk).\n";
    out << "NOTE: full enumeration via SetupAPI or WMI recommended for production.\n";
    return out.str();
#else
    return skipped_report(flag, "SetupAPI is Windows-only.");
#endif
}

// VBOX_NETWORK (Windows)
static std::string probe_VBOX_NETWORK() {
    const std::string flag = "VM::VBOX_NETWORK";
#if defined(_WIN32)
    HKEY h; bool hasFlt=false, hasLwf=false;
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Services\\VBoxNetFlt", 0, KEY_READ, &h) == ERROR_SUCCESS) { hasFlt=true; RegCloseKey(h); }
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Services\\VBoxNetLwf", 0, KEY_READ, &h) == ERROR_SUCCESS) { hasLwf=true; RegCloseKey(h); }
    std::ostringstream out;
    out << "FLAG: " << flag << "\n";
    out << "PASS: " << ((hasFlt||hasLwf)? "true":"false") << "\n";
    out << "RAW: VBoxNetFlt=" << (hasFlt?"present":"absent") << " VBoxNetLwf=" << (hasLwf?"present":"absent") << "\n";
    out << "REASON: " << ((hasFlt||hasLwf) ? "VirtualBox network driver(s) present (registry service entries)." : "No VBox network service registry keys found.") << "\n";
    out << "NOTE: NIC MAC OUI checks add corroboration.\n";
    return out.str();
#else
    return skipped_report(flag, "VirtualBox network driver registry probe is Windows-only.");
#endif
}

// WINE_CHECK (Windows)
static std::string probe_WINE_CHECK() {
    const std::string flag = "VM::WINE_CHECK";
#if defined(_WIN32)
    const char* testPath = "C:\\Windows\\System32\\wine_get_unix_file_name";
    DWORD attrs = GetFileAttributesA(testPath);
    bool exists = (attrs != INVALID_FILE_ATTRIBUTES);
    std::ostringstream out;
    out << "FLAG: " << flag << "\n";
    out << "PASS: " << (exists ? "true" : "false") << "\n";
    out << "RAW: file_exists=\"" << (exists ? testPath : "<not found>") << "\"\n";
    out << "REASON: " << (exists ? "Wine runtime marker found on file system." : "No Wine file marker found.") << "\n";
    out << "NOTE: weak check; false negatives possible.\n";
    return out.str();
#else
    return skipped_report(flag, "Wine marker probe is Windows-specific or not applicable.");
#endif
}

// HYPERV_QUERY (light)
static std::string probe_HYPERV_QUERY() {
    const std::string flag = "VM::HYPERV_QUERY";
#if defined(_WIN32)
    bool hv_bit = false;
#if defined(__i386__) || defined(__x86_64__) || defined(_M_X64) || defined(_M_IX86)
    unsigned a=0,b=0,c=0,d=0; cpuid_ex(1,0,a,b,c,d); hv_bit = ((c>>31)&1);
#endif
    std::ostringstream out;
    out << "FLAG: " << flag << "\n";
    out << "PASS: " << (hv_bit ? "true" : "false") << "\n";
    out << "RAW: hypervisor_bit=" << (hv_bit?1:0) << "\n";
    out << "REASON: " << (hv_bit ? "Hypervisor system information appears present." : "No hypervisor bit detected by light probe.") << "\n";
    out << "NOTE: full Hyper-V query requires NtQuerySystemInformation and may require privileges; this is light.\n";
    return out.str();
#else
    return skipped_report(flag, "Hyper-V query is Windows-specific.");
#endif
}

// NETTITUDE_VM_MEMORY (light)
static std::string probe_NETTITUDE_VM_MEMORY() {
    const std::string flag = "VM::NETTITUDE_VM_MEMORY";
#if defined(_WIN32)
    SIZE_T regions = 0;
    MEMORY_BASIC_INFORMATION mbi;
    unsigned char* addr = nullptr;
    while (VirtualQuery(addr, &mbi, sizeof(mbi)) == sizeof(mbi)) {
        ++regions;
        addr += mbi.RegionSize;
        if (addr == nullptr) break;
    }
    std::ostringstream out;
    out << "FLAG: " << flag << "\n";
    out << "PASS: skipped\n";
    out << "RAW: memory_region_count=" << regions << "\n";
    out << "REASON: This probe reports region count as light evidence; full Nettitude heuristics omitted.\n";
    out << "NOTE: full scan is expensive and may be noisy; enable with elevated mode.\n";
    return out.str();
#else
    return skipped_report(flag, "Nettitude memory heuristic implemented as Windows sample only.");
#endif
}

// VMWARE_BACKDOOR (32-bit) - skipped in x64
static std::string probe_VMWARE_BACKDOOR() {
    const std::string flag = "VM::VMWARE_BACKDOOR";
#if (defined(_M_IX86) || defined(__i386__))
    // Not implemented in safe mode: requires IO port access / privileges.
    return skipped_report(flag, "VMware backdoor requires 32-bit build and special privileges; skipped in safe build.");
#else
    return skipped_report(flag, "VMware backdoor requires 32-bit build; skipped on x64.");
#endif
}

// NATIVE_VHD (Windows hint)
static std::string probe_NATIVE_VHD() {
    const std::string flag = "VM::NATIVE_VHD";
#if defined(_WIN32)
    std::ostringstream out;
    out << "FLAG: " << flag << "\n";
    out << "PASS: skipped\n";
    out << "RAW: <use Win32_DiskDrive or driver enumeration for native VHD detection>\n";
    out << "REASON: Native VHD evidence requires disk model/driver enumeration via WMI or SetupAPI.\n";
    out << "NOTE: integrate WMI for full results.\n";
    return out.str();
#else
    return skipped_report(flag, "Native VHD detection is Windows-specific.");
#endif
}

// FIRMWARE_SCAN (light)
static std::string probe_FIRMWARE_SCAN() {
    const std::string flag = "VM::FIRMWARE_SCAN";
#if defined(_WIN32)
    return probe_MSSMBIOS();
#elif defined(__linux__)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    std::string board = read_small_file("/sys/class/dmi/id/board_vendor");
    std::string bios = read_small_file("/sys/class/dmi/id/bios_vendor");
    std::string product = read_small_file("/sys/class/dmi/id/product_name");
    bool suspect = (board.find("innotek")!=std::string::npos || bios.find("SeaBIOS")!=std::string::npos ||
                    product.find("Virtual")!=std::string::npos || board.find("QEMU")!=std::string::npos);
    out << "PASS: " << (suspect ? "true":"false") << "\n";
    out << "RAW: board_vendor=\"" << board << "\" bios_vendor=\"" << bios << "\" product_name=\"" << product << "\"\n";
    out << "REASON: " << (suspect ? "Firmware/DMI strings contain VM-specific tokens." : "No VM tokens found in firmware/DMI scan.") << "\n";
    out << "NOTE: full ACPI table scanning may require root.\n";
    return out.str();
#elif defined(__APPLE__)
    return probe_MSSMBIOS();
#else
    return skipped_report(flag, "Unsupported platform for firmware scan.");
#endif
}

// ----------------- Previously-added skipped flags implementations -----------------

// GPU_CAPABILITIES
static std::string probe_GPU_CAPABILITIES() {
    const std::string flag = "VM::GPU_CAPABILITIES";
#if defined(_WIN32)
    DISPLAY_DEVICEA dd; ZeroMemory(&dd, sizeof(dd)); dd.cb = sizeof(dd);
    std::ostringstream out;
    bool found = false;
    out << "FLAG: " << flag << "\n";
    for (DWORD i=0; EnumDisplayDevicesA(nullptr, i, &dd, 0); ++i) {
        std::string name = dd.DeviceString ? dd.DeviceString : "";
        std::string deviceKey = dd.DeviceKey ? dd.DeviceKey : "";
        out << "RAW: device["<<i<<"]=\"" << name << "\" deviceKey=\"" << deviceKey << "\"\n";
        if (name.find("VBox")!=std::string::npos || name.find("VirtualBox")!=std::string::npos
            || name.find("VMware")!=std::string::npos) found = true;
        ZeroMemory(&dd, sizeof(dd)); dd.cb = sizeof(dd);
    }
    out << "PASS: " << (found ? "true" : "false") << "\n";
    out << "REASON: " << (found ? "Display adapter string contains VirtualBox/VMware tokens." :
                "No VM-branded display adapters detected by EnumDisplayDevices.") << "\n";
    out << "NOTE: For deeper GPU info consider D3D/OpenGL queries; this is a low-priv probe.\n";
    return out.str();
#elif defined(__linux__)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    glob_t g; if (glob("/sys/class/drm/card*/device/uevent", 0, NULL, &g)==0) {
        bool found=false;
        for (size_t i=0;i<g.gl_pathc;i++){
            std::string path = g.gl_pathv[i];
            std::string content = read_small_file(path);
            out << "RAW: " << path << " -> " << content << "\n";
            if (content.find("VirtualBox")!=std::string::npos || content.find("vbox")!=std::string::npos) found=true;
        }
        out << "PASS: " << (found ? "true":"false") << "\n";
        out << "REASON: " << (found ? "DRM device uevent contains VirtualBox token." : "No VM tokens in DRM uevent files.") << "\n";
        globfree(&g);
        return out.str();
    } else {
        return skipped_report(flag, "/sys/class/drm not accessible or not present.");
    }
#elif defined(__APPLE__)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    FILE* p = popen("system_profiler SPDisplaysDataType 2>/dev/null", "r");
    if (!p) return skipped_report(flag, "system_profiler unavailable.");
    char buf[512]; bool found=false; std::string accum;
    while (fgets(buf, sizeof buf, p)) {
        accum += buf;
        if (strstr(buf, "VirtualBox") || strstr(buf, "VBox") || strstr(buf, "VMware")) found = true;
    }
    pclose(p);
    out << "RAW: " << (accum.size()>0 ? accum.substr(0,1024) : "<no output>") << "\n";
    out << "PASS: " << (found ? "true":"false") << "\n";
    out << "REASON: " << (found ? "system_profiler reports VirtualBox/VMware GPU strings." : "No VM GPU strings in system_profiler.") << "\n";
    out << "NOTE: truncated output shown.\n";
    return out.str();
#else
    return skipped_report(flag, "Unsupported platform.");
#endif
}

// POWER_CAPABILITIES
static std::string probe_POWER_CAPABILITIES() {
    const std::string flag = "VM::POWER_CAPABILITIES";
#if defined(_WIN32)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    HKEY h; if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, "HARDWARE\\DESCRIPTION\\System\\BIOS", 0, KEY_READ, &h) == ERROR_SUCCESS) {
        char buf[512]; DWORD sz = sizeof(buf);
        RegGetValueA(h, nullptr, "BIOSVendor", RRF_RT_REG_SZ, nullptr, buf, &sz);
        std::string bios = buf;
        out << "RAW: BIOSVendor=\"" << bios << "\"\n";
        bool suspect = (bios.find("VBox")!=std::string::npos || bios.find("VirtualBox")!=std::string::npos || bios.find("innotek")!=std::string::npos);
        out << "PASS: " << (suspect ? "true":"false") << "\n";
        out << "REASON: " << (suspect ? "BIOS vendor string includes VirtualBox token." : "No VirtualBox token in BIOS vendor string.") << "\n";
        RegCloseKey(h);
        return out.str();
    } else {
        return skipped_report(flag, "Unable to access BIOS registry key.");
    }
#elif defined(__linux__)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    glob_t g; if (glob("/sys/firmware/acpi/tables/*", 0, NULL, &g)==0) {
        bool suspect=false;
        for (size_t i=0;i<g.gl_pathc;i++){
            std::string p = g.gl_pathv[i];
            if (p.find("VBOX")!=std::string::npos || p.find("VBox")!=std::string::npos) suspect=true;
            out << "RAW: " << p << "\n";
        }
        out << "PASS: " << (suspect ? "true":"false") << "\n";
        out << "REASON: " << (suspect ? "ACPI table names contain VBOX tokens." : "No obvious VBOX tokens in ACPI table names.") << "\n";
        globfree(&g);
        return out.str();
    } else {
        return skipped_report(flag, "/sys/firmware/acpi not present or inaccessible.");
    }
#elif defined(__APPLE__)
    char model[256]; size_t len=sizeof(model);
    if (sysctlbyname("hw.model", model, &len, NULL, 0) != 0) return skipped_report(flag, "sysctl(hw.model) unavailable.");
    std::string model_s(model);
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    out << "RAW: hw.model=\"" << model_s << "\"\n";
    bool suspect = (model_s.find("VirtualBox")!=std::string::npos || model_s.find("VMware")!=std::string::npos);
    out << "PASS: " << (suspect?"true":"false") << "\n";
    out << "REASON: " << (suspect ? "hw.model contains VM vendor token." : "No VM token in hw.model.") << "\n";
    return out.str();
#else
    return skipped_report(flag, "Unsupported platform.");
#endif
}

// DISK_SERIAL
static std::string probe_DISK_SERIAL() {
    const std::string flag = "VM::DISK_SERIAL";
#if defined(_WIN32)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    HKEY h; bool suspect=false;
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Services", 0, KEY_READ, &h) == ERROR_SUCCESS) {
        const char* checks[] = {"vboxguest","VDS","vhdmp","vboxsf","vboxdrv","vmci"};
        for (auto &c: checks) {
            HKEY sub; if (RegOpenKeyExA(h, c, 0, KEY_READ, &sub) == ERROR_SUCCESS) { suspect=true; RegCloseKey(sub); }
        }
        out << "RAW: suspect_driver_entries_found=" << (suspect?"yes":"no") << "\n";
        out << "PASS: " << (suspect ? "true":"false") << "\n";
        out << "REASON: " << (suspect ? "Found virtual disk/VM driver keys under Services." : "No obvious virtual disk driver keys found.") << "\n";
        RegCloseKey(h);
        return out.str();
    } else {
        return skipped_report(flag, "Cannot enumerate Services registry key (permission).");
    }
#elif defined(__linux__)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    bool suspect=false;
    glob_t g; if (glob("/sys/block/*", 0, NULL, &g)==0) {
        for (size_t i=0;i<g.gl_pathc;i++){
            std::string dev = g.gl_pathv[i];
            std::string model = read_small_file(dev + "/device/model");
            std::string serial = read_small_file(dev + "/device/serial");
            if (!model.empty()) {
                out << "RAW: " << dev << " model=\"" << model << "\" serial=\"" << serial << "\"\n";
                std::string lm = model; std::transform(lm.begin(), lm.end(), lm.begin(), ::tolower);
                if (lm.find("vbox")!=std::string::npos || lm.find("virtual")!=std::string::npos) suspect=true;
            }
        }
        out << "PASS: " << (suspect ? "true":"false") << "\n";
        out << "REASON: " << (suspect ? "Disk model/serial indicates virtual disk." : "No virtual disk signatures found in /sys/block.") << "\n";
        globfree(&g);
        return out.str();
    } else {
        return skipped_report(flag, "/sys/block not accessible");
    }
#elif defined(__APPLE__)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    FILE* p = popen("system_profiler SPStorageDataType 2>/dev/null", "r");
    if (!p) return skipped_report(flag, "system_profiler unavailable.");
    char buf[512]; bool suspect=false; std::string accum;
    while (fgets(buf,sizeof buf,p)) {
        accum += buf;
        if (strstr(buf,"Virtual") || strstr(buf,"VBOX") || strstr(buf,"VBox")) suspect=true;
    }
    pclose(p);
    out << "RAW: " << (accum.size()>0?accum.substr(0,1024):"<none>") << "\n";
    out << "PASS: " << (suspect? "true":"false") << "\n";
    out << "REASON: " << (suspect ? "system_profiler reports virtual disk model/strings." : "No virtual disk tokens in system_profiler.") << "\n";
    return out.str();
#else
    return skipped_report(flag, "Unsupported platform.");
#endif
}

// DRIVERS
static std::string probe_DRIVERS() {
    const std::string flag = "VM::DRIVERS";
#if defined(_WIN32)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    HKEY h; if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Services", 0, KEY_READ, &h) != ERROR_SUCCESS)
        return skipped_report(flag, "Cannot open Services registry key.");
    const char* drivers[] = {"VBoxGuest", "VBoxService", "vboxsf", "VMTools", "vmhgfs", "vmci", "vmmem"};
    std::vector<std::string> found;
    for (auto d: drivers) {
        HKEY sub; if (RegOpenKeyExA(h, d, 0, KEY_READ, &sub) == ERROR_SUCCESS) { found.emplace_back(d); RegCloseKey(sub); }
    }
    out << "RAW: drivers_found=[";
    for (size_t i=0;i<found.size();++i) { out << found[i] << (i+1<found.size()? ", ":""); }
    out << "]\n";
    out << "PASS: " << (!found.empty()? "true":"false") << "\n";
    out << "REASON: " << (!found.empty() ? "Known VM drivers/services present." : "No known VM drivers found in Services registry.") << "\n";
    RegCloseKey(h);
    return out.str();
#elif defined(__linux__)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    std::string mods = read_small_file("/proc/modules");
    bool found = false;
    std::vector<std::string> sigs = {"vboxguest","vboxsf","vboxvideo","vmw_vsock","vmw_vmci","kvm"};
    std::vector<std::string> foundlist;
    for (auto &s: sigs) if (!mods.empty() && mods.find(s) != std::string::npos) { found=true; foundlist.push_back(s); }
    out << "RAW: modules_snapshot=\"" << (mods.size()>200?mods.substr(0,200):mods) << "\"\n";
    out << "PASS: " << (found? "true":"false") << "\n";
    out << "REASON: " << (found ? "Kernel modules include known VM module names." : "No common VM kernel modules found in /proc/modules.") << "\n";
    return out.str();
#elif defined(__APPLE__)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    FILE* p = popen("kextstat 2>/dev/null", "r");
    if (!p) return skipped_report(flag, "kextstat not available.");
    char buf[512]; bool found=false; std::string accum;
    while (fgets(buf, sizeof buf, p)) {
        accum += buf;
        if (strstr(buf,"VBox") || strstr(buf,"vmware")) found=true;
    }
    pclose(p);
    out << "RAW: " << (accum.size()>0?accum.substr(0,1024):"<none>") << "\n";
    out << "PASS: " << (found? "true":"false") << "\n";
    out << "REASON: " << (found ? "Loaded kernel extensions indicate VM vendor." : "No VM kernel extensions observed.") << "\n";
    return out.str();
#else
    return skipped_report(flag, "Unsupported platform.");
#endif
}

// DEVICE_HANDLES
static std::string probe_DEVICE_HANDLES() {
    const std::string flag = "VM::DEVICE_HANDLES";
#if defined(_WIN32)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    const char* keys[] = {"vboxguest","vmci","vmmemctl","vmmouse"};
    bool found=false; out << "RAW: device_indicators=[";
    for (size_t i=0;i<sizeof(keys)/sizeof(keys[0]);++i) {
        HKEY h; if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, ("SYSTEM\\CurrentControlSet\\Services\\" + std::string(keys[i])).c_str(), 0, KEY_READ, &h)==ERROR_SUCCESS) {
            found=true; out << keys[i] << (i+1<sizeof(keys)/sizeof(keys[0])? ",":"");
            RegCloseKey(h);
        }
    }
    out << "]\n";
    out << "PASS: " << (found? "true":"false") << "\n";
    out << "REASON: " << (found ? "Registry indicates VM-specific device/service names." : "No immediate VM device indicators in Services registry.") << "\n";
    return out.str();
#elif defined(__linux__)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    std::vector<std::string> suspects = {"vboxguest","vmci","vport","vboxsf","vmmem"};
    DIR* d = opendir("/dev");
    bool found=false;
    if (!d) return skipped_report(flag, "/dev not accessible");
    struct dirent* ent;
    out << "RAW: /dev entries containing VM tokens: [";
    bool first=true;
    while ((ent = readdir(d)) != NULL) {
        std::string name(ent->d_name);
        for (auto &s: suspects) {
            if (name.find(s) != std::string::npos) {
                if (!first) out << ", ";
                out << name; first=false; found=true;
            }
        }
    }
    out << "]\n";
    closedir(d);
    out << "PASS: " << (found? "true":"false") << "\n";
    out << "REASON: " << (found ? "Device nodes matching VM tokens found under /dev." : "No VM device nodes found under /dev.") << "\n";
    return out.str();
#elif defined(__APPLE__)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    FILE* p = popen("ioreg -l 2>/dev/null | grep -i 'VBOX\\|VMware\\|vbox' || true", "r");
    if (!p) return skipped_report(flag, "ioreg unavailable.");
    char buf[512]; bool found=false; std::string accum;
    while (fgets(buf,sizeof buf,p)) { accum += buf; if (strstr(buf,"VBOX")||strstr(buf,"VMware")) found=true; }
    pclose(p);
    out << "RAW: " << (accum.size()>0?accum.substr(0,1024):"<none>") << "\n";
    out << "PASS: " << (found?"true":"false") << "\n";
    out << "REASON: " << (found ? "IORegistry shows VM device entries." : "No VM device entries in ioreg.") << "\n";
    return out.str();
#else
    return skipped_report(flag, "Unsupported platform.");
#endif
}

// VIRTUAL_PROCESSORS
static std::string probe_VIRTUAL_PROCESSORS() {
    const std::string flag = "VM::VIRTUAL_PROCESSORS";
#if defined(_WIN32)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    SYSTEM_INFO si; GetNativeSystemInfo(&si);
    DWORD logical = si.dwNumberOfProcessors;
    out << "RAW: logical_processors=" << logical << "\n";
    bool suspect = (logical <= 2);
    out << "PASS: " << (suspect ? "true":"false") << "\n";
    out << "REASON: " << (suspect ? "Low logical CPU count (<=2) observed; may indicate vCPU-limited VM." : "Logical CPU count appears typical for a physical machine.") << "\n";
    out << "NOTE: Combine with CPU model mapping for stronger evidence.\n";
    return out.str();
#elif defined(__linux__)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    std::string cpuinfo = read_small_file("/proc/cpuinfo");
    int count=0;
    for (size_t pos=0; pos<cpuinfo.size();) {
        size_t p = cpuinfo.find("processor", pos);
        if (p==std::string::npos) break;
        ++count; pos = p+9;
    }
    out << "RAW: logical_processors=" << count << "\n";
    bool suspect = (count <= 2);
    out << "PASS: " << (suspect? "true":"false") << "\n";
    out << "REASON: " << (suspect ? "Low logical CPU count observed; may indicate VM." : "CPU count not indicative of VM alone.") << "\n";
    return out.str();
#elif defined(__APPLE__)
    int nm=0; size_t s = sizeof(nm);
    if (sysctlbyname("hw.ncpu", &nm, &s, NULL, 0) != 0) return skipped_report(flag, "sysctl(hw.ncpu) failed.");
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    out << "RAW: hw.ncpu=" << nm << "\n";
    bool suspect = (nm <= 2);
    out << "PASS: " << (suspect? "true":"false") << "\n";
    out << "REASON: " << (suspect ? "Low logical CPU count observed; may indicate VM." : "CPU count not indicative of VM alone.") << "\n";
    return out.str();
#else
    return skipped_report(flag, "Unsupported platform.");
#endif
}

// REGISTRY_KEYS (Windows)
static std::string probe_REGISTRY_KEYS() {
    const std::string flag = "VM::REGISTRY_KEYS";
#if defined(_WIN32)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    const char* keys[] = {
        "SOFTWARE\\Oracle\\VirtualBox Guest Additions",
        "SYSTEM\\CurrentControlSet\\Services\\VBoxGuest",
        "SYSTEM\\CurrentControlSet\\Services\\VBoxService",
        "SOFTWARE\\VMware, Inc.\\VMware Tools"
    };
    std::vector<std::string> found;
    for (auto &k: keys) {
        HKEY h; if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, k, 0, KEY_READ, &h) == ERROR_SUCCESS) { found.push_back(k); RegCloseKey(h); }
    }
    out << "RAW: registry_keys_found=[";
    for (size_t i=0;i<found.size();++i) { out << found[i] << (i+1<found.size()? ", ":""); }
    out << "]\n";
    out << "PASS: " << (!found.empty() ? "true":"false") << "\n";
    out << "REASON: " << (!found.empty() ? "Known VM registry keys present." : "No known VM registry keys found.") << "\n";
    return out.str();
#else
    return skipped_report(flag, "Registry-key probe is Windows-only.");
#endif
}

// TRAP (debugger / tracer presence)
static std::string probe_TRAP() {
    const std::string flag = "VM::TRAP";
#if defined(__linux__)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    std::string s = read_small_file("/proc/self/status");
    size_t p = s.find("TracerPid:");
    int tracer = 0;
    if (p != std::string::npos) {
        std::istringstream iss(s.substr(p+10));
        iss >> tracer;
    }
    out << "RAW: TracerPid=" << tracer << "\n";
    out << "PASS: " << (tracer!=0 ? "true":"false") << "\n";
    out << "REASON: " << (tracer!=0 ? "Process is being traced (ptrace); traps may be present." : "No tracer detected.") << "\n";
    return out.str();
#elif defined(_WIN32)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    BOOL dbg = IsDebuggerPresent();
    out << "RAW: IsDebuggerPresent=" << (dbg?1:0) << "\n";
    out << "PASS: " << (dbg? "true":"false") << "\n";
    out << "REASON: " << (dbg? "Process is under debugger/tracing." : "No debugger detected.") << "\n";
    return out.str();
#elif defined(__APPLE__)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    int mib[4]; struct kinfo_proc kp; size_t len = sizeof(kp);
    mib[0] = CTL_KERN; mib[1] = KERN_PROC; mib[2] = KERN_PROC_PID; mib[3] = getpid();
    if (sysctl(mib,4,&kp,&len,nullptr,0) == 0) {
        bool traced = (kp.kp_proc.p_flag & P_TRACED);
        out << "RAW: p_flag=" << kp.kp_proc.p_flag << "\n";
        out << "PASS: " << (traced?"true":"false") << "\n";
        out << "REASON: " << (traced? "Process is being traced/has traps." : "No process tracing detected.") << "\n";
        return out.str();
    } else {
        return skipped_report(flag, "sysctl KERN_PROC failed.");
    }
#else
    return skipped_report(flag, "Unsupported platform.");
#endif
}

// SMBIOS_PASSTHROUGH (reuse MSSMBIOS)
static std::string probe_SMBIOS_PASSTHROUGH() {
    const std::string flag = "VM::SMBIOS_PASSTHROUGH";
    return probe_MSSMBIOS();
}

// BOOT_LOGO (light)
static std::string probe_BOOT_LOGO() {
    const std::string flag = "VM::BOOT_LOGO";
#if defined(_WIN32)
    HKEY h; if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\OEMInformation", 0, KEY_READ, &h) == ERROR_SUCCESS) {
        char buf[512]; DWORD sz=sizeof(buf);
        RegGetValueA(h, nullptr, "Logo", RRF_RT_REG_SZ, nullptr, buf, &sz);
        std::string logo = buf;
        RegCloseKey(h);
        std::ostringstream out; out << "FLAG: " << flag << "\n";
        out << "RAW: OEMInformation.Logo=\"" << (logo.empty()? "<none>":logo) << "\"\n";
        out << "PASS: false\n";
        out << "REASON: Most VMs do not set OEM logo; this probe is informational.\n";
        return out.str();
    } else return skipped_report(flag, "OEMInformation registry inaccessible.");
#elif defined(__linux__)
    return skipped_report(flag, "Boot logo probe not available on Linux in light mode.");
#elif defined(__APPLE__)
    return skipped_report(flag, "Boot logo probe not applicable on macOS.");
#else
    return skipped_report(flag, "Unsupported platform.");
#endif
}

// FIRMWARE (reuse MSSMBIOS or DMI)
static std::string probe_FIRMWARE() {
    const std::string flag = "VM::FIRMWARE";
#if defined(_WIN32)
    return probe_MSSMBIOS();
#elif defined(__linux__)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    std::string bios = read_small_file("/sys/class/dmi/id/bios_vendor");
    std::string board = read_small_file("/sys/class/dmi/id/board_vendor");
    out << "RAW: bios_vendor=\"" << bios << "\" board_vendor=\"" << board << "\"\n";
    bool suspect = (bios.find("innotek")!=std::string::npos || board.find("VirtualBox")!=std::string::npos || bios.find("SeaBIOS")!=std::string::npos);
    out << "PASS: " << (suspect? "true":"false") << "\n";
    out << "REASON: " << (suspect ? "Firmware/DMI strings indicate virtualization." : "No obvious VM indicators in firmware values.") << "\n";
    out << "NOTE: full ACPI read may require root.\n";
    return out.str();
#elif defined(__APPLE__)
    return probe_MSSMBIOS();
#else
    return skipped_report(flag, "Unsupported platform.");
#endif
}

// PCI_DEVICES
static std::string probe_PCI_DEVICES() {
    const std::string flag = "VM::PCI_DEVICES";
#if defined(__linux__)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    glob_t g; if (glob("/sys/bus/pci/devices/*/vendor",0,NULL,&g)==0) {
        bool suspect=false;
        for (size_t i=0;i<g.gl_pathc;i++) {
            std::string vendor = read_small_file(g.gl_pathv[i]);
            std::string devdir = std::string(g.gl_pathv[i]).substr(0,std::string(g.gl_pathv[i]).find("/vendor"));
            std::string modalias = read_small_file(devdir + "/modalias");
            out << "RAW: " << devdir << " vendor=\"" << vendor << "\" modalias=\"" << modalias << "\"\n";
            if (vendor.find("0x80ee")!=std::string::npos || modalias.find("vbox")!=std::string::npos) suspect=true;
        }
        globfree(&g);
        out << "PASS: " << (suspect? "true":"false") << "\n";
        out << "REASON: " << (suspect? "PCI devices include VirtualBox/QEMU vendor IDs." : "No obvious VM PCI vendor IDs found.") << "\n";
        return out.str();
    } else {
        return skipped_report(flag, "/sys/bus/pci/devices not accessible.");
    }
#elif defined(_WIN32)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    out << "RAW: (use SetupDiGetClassDevs to enumerate PCI devices for precise data)\n";
    out << "PASS: skipped\n";
    out << "REASON: Use SetupAPI to enumerate PCI devices; omitted for safe probe.\n";
    return out.str();
#elif defined(__APPLE__)
    FILE* p = popen("system_profiler SPPCIDataType 2>/dev/null", "r");
    if (!p) return skipped_report(flag, "system_profiler unavailable.");
    char buf[512]; bool found=false; std::string accum;
    while (fgets(buf,sizeof buf,p)) { accum += buf; if (strstr(buf,"VirtualBox")||strstr(buf,"VMware")||strstr(buf,"QEMU")) found=true; }
    pclose(p);
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    out << "RAW: " << (accum.size()?accum.substr(0,1024):"<none>") << "\n";
    out << "PASS: " << (found? "true":"false") << "\n";
    out << "REASON: " << (found ? "system_profiler PCI report contains VM strings." : "No VM tokens in PCI report.") << "\n";
    return out.str();
#else
    return skipped_report(flag, "Unsupported platform.");
#endif
}

// TIMER (raw sample)
static std::string probe_TIMER() {
    const std::string flag = "VM::TIMER";
#if defined(__linux__) || defined(_WIN32) || defined(__APPLE__)
    using namespace std::chrono;
    auto t0 = high_resolution_clock::now();
    for (volatile int i=0;i<1000;i++);
    auto t1 = high_resolution_clock::now();
    auto delta = duration_cast<nanoseconds>(t1 - t0).count();
    std::ostringstream out;
    out << "FLAG: " << flag << "\n";
    out << "RAW: sample_delta_ns=" << delta << "\n";
    out << "PASS: skipped\n";
    out << "REASON: Timer jitter sample provided; full timer heuristics require more analysis and thresholds.\n";
    out << "NOTE: Use statistical tests across multiple samples for detection.\n";
    return out.str();
#else
    return skipped_report(flag, "Unsupported platform.");
#endif
}

// HYPERVISOR_STR (CPUID leaf 0x40000000)
static std::string probe_HYPERVISOR_STR() {
    const std::string flag = "VM::HYPERVISOR_STR";
#if defined(__i386__) || defined(__x86_64__) || defined(_M_X64) || defined(_M_IX86)
    unsigned a=0,b=0,c=0,d=0; cpuid_ex(0x40000000,0,a,b,c,d);
    char s[13] = {}; memcpy(s+0,&b,4); memcpy(s+4,&c,4); memcpy(s+8,&d,4);
    std::string vstr(s);
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    out << "RAW: leaf0x40000000.vendor=\"" << vstr << "\"\n";
    bool found = (vstr.find("KVM")!=std::string::npos || vstr.find("VMware")!=std::string::npos ||
                  vstr.find("VBox")!=std::string::npos || vstr.find("Microsoft")!=std::string::npos);
    out << "PASS: " << (found? "true":"false") << "\n";
    out << "REASON: " << (found ? "Hypervisor vendor string contains known VM tokens." : "No known hypervisor vendor string returned by CPUID leaf 0x40000000.") << "\n";
    out << "NOTE: x86 CPUID only.\n";
    return out.str();
#else
    return skipped_report(flag, "Non-x86 platform (CPUID not available).");
#endif
}

// ----------------- VMware-specific probes (new) -----------------

// VMWARE_SMBIOS
static std::string probe_VMWARE_SMBIOS() {
    const std::string flag = "VM::VMWARE_SMBIOS";
#if defined(_WIN32)
    HKEY h; if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, "HARDWARE\\DESCRIPTION\\System\\BIOS", 0, KEY_READ, &h) != ERROR_SUCCESS)
        return skipped_report(flag, "Cannot read SMBIOS registry key.");
    char buf[512]; DWORD size = sizeof(buf);
    RegGetValueA(h, nullptr, "SystemManufacturer", RRF_RT_REG_SZ, nullptr, buf, &size);
    std::string manuf = buf; size = sizeof(buf);
    RegGetValueA(h, nullptr, "SystemProductName", RRF_RT_REG_SZ, nullptr, buf, &size);
    std::string prod = buf;
    RegCloseKey(h);
    bool suspect = (manuf.find("VMware")!=std::string::npos || prod.find("VMware")!=std::string::npos);
    std::ostringstream out;
    out << "FLAG: " << flag << "\n";
    out << "PASS: " << (suspect?"true":"false") << "\n";
    out << "RAW: SystemManufacturer=\"" << manuf << "\" SystemProductName=\"" << prod << "\"\n";
    out << "REASON: " << (suspect ? "SMBIOS contains VMware vendor/product strings." : "No VMware SMBIOS strings found.") << "\n";
    return out.str();
#elif defined(__linux__)
    std::string sys_vendor = read_small_file("/sys/class/dmi/id/sys_vendor");
    std::string product = read_small_file("/sys/class/dmi/id/product_name");
    bool suspect = (sys_vendor.find("VMware")!=std::string::npos || product.find("VMware")!=std::string::npos);
    std::ostringstream out;
    out << "FLAG: " << flag << "\n";
    out << "PASS: " << (suspect?"true":"false") << "\n";
    out << "RAW: sys_vendor=\"" << sys_vendor << "\" product_name=\"" << product << "\"\n";
    out << "REASON: " << (suspect ? "DMI/SMBIOS strings indicate VMware." : "No VMware tokens found in DMI.") << "\n";
    return out.str();
#elif defined(__APPLE__)
    char model[256]; size_t len = sizeof(model);
    if (sysctlbyname("hw.model", model, &len, NULL, 0) != 0) return skipped_report(flag, "sysctl(hw.model) failed.");
    std::string m(model);
    bool suspect = (m.find("VMware")!=std::string::npos);
    std::ostringstream out;
    out << "FLAG: " << flag << "\n";
    out << "PASS: " << (suspect?"true":"false") << "\n";
    out << "RAW: hw.model=\"" << m << "\"\n";
    out << "REASON: " << (suspect ? "hw.model contains VMware token." : "No VMware token in hw.model.") << "\n";
    return out.str();
#else
    return skipped_report(flag, "Unsupported platform.");
#endif
}

// VMWARE_TOOLS
static std::string probe_VMWARE_TOOLS() {
    const std::string flag = "VM::VMWARE_TOOLS";
#if defined(_WIN32)
    std::ostringstream out; out << "FLAG: " << flag << "\n";

    // check common install path (safe)
    std::string path = "C:\\Program Files\\VMware\\VMware Tools\\VMwareTray.exe";
    DWORD attrs = GetFileAttributesA(path.c_str());
    bool exists = (attrs != INVALID_FILE_ATTRIBUTES);

    // check running processes via Toolhelp snapshot
    bool procFound = false;
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap != INVALID_HANDLE_VALUE) {
        PROCESSENTRY32 pe;
        pe.dwSize = sizeof(pe);
        if (Process32First(snap, &pe)) {
            do {
                std::string sname = pe.szExeFile;
                // lowercase comparison would be safer; simple substring match for speed
                if (sname.find("vmtoolsd") != std::string::npos || sname.find("VMTools") != std::string::npos
                    || sname.find("vmware") != std::string::npos) {
                    procFound = true;
                    break;
                }
            } while (Process32Next(snap, &pe));
        }
        CloseHandle(snap);
    } else {
        // If snapshot creation failed, still continue; we'll return what we have
    }

    out << "RAW: tools_path_exists=" << (exists ? "yes" : "no") << " process_found=" << (procFound ? "yes" : "no") << "\n";
    out << "PASS: " << ((exists || procFound) ? "true" : "false") << "\n";
    out << "REASON: " << ((exists || procFound) ? "VMware Tools files or processes found." : "No VMware Tools files/processes found.") << "\n";
    return out.str();
#elif defined(__linux__)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    bool found = false;
    struct stat st;
    if (stat("/usr/bin/vmtoolsd", &st) == 0) found = true;
    DIR* d = opendir("/proc");
    if (d) {
        struct dirent* ent;
        while ((ent = readdir(d))!=NULL) {
            if (!isdigit(ent->d_name[0])) continue;
            std::string cmd = read_small_file(std::string("/proc/") + ent->d_name + "/comm");
            if (cmd.find("vmtoolsd")!=std::string::npos || cmd.find("vmware")!=std::string::npos) { found=true; break; }
        }
        closedir(d);
    }
    out << "RAW: tools_binary_present=" << (stat("/usr/bin/vmtoolsd",&st)==0 ? "yes":"no") << " running=" << (found ? "yes":"no") << "\n";
    out << "PASS: " << (found? "true":"false") << "\n";
    out << "REASON: " << (found ? "VMware Tools binaries or processes observed." : "No VMware Tools observed in standard locations.") << "\n";
    return out.str();
#elif defined(__APPLE__)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    FILE* p = popen("ps aux | grep -i vmware | grep -v grep || true", "r");
    if (!p) return skipped_report(flag, "ps unavailable.");
    char buf[256]; bool found=false; std::string accum;
    while (fgets(buf,sizeof buf,p)) { accum += buf; if (strlen(buf)>2) found=true; }
    pclose(p);
    out << "RAW: " << (accum.size()>0?accum.substr(0,1024):"<none>") << "\n";
    out << "PASS: " << (found ? "true":"false") << "\n";
    out << "REASON: " << (found ? "VMware-related processes present." : "No VMware-related processes detected.") << "\n";
    return out.str();
#else
    return skipped_report(flag, "Unsupported platform.");
#endif
}

// VMCI_DEVICE
static std::string probe_VMCI_DEVICE() {
    const std::string flag = "VM::VMCI_DEVICE";
#if defined(_WIN32)
    HKEY h; if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, "SYSTEM\\CurrentControlSet\\Services\\vmci", 0, KEY_READ, &h) == ERROR_SUCCESS) {
        RegCloseKey(h);
        std::ostringstream out; out << "FLAG: " << flag << "\n";
        out << "PASS: true\n";
        out << "RAW: Service key exists: SYSTEM\\\\CurrentControlSet\\\\Services\\\\vmci\n";
        out << "REASON: vmci service entry present in registry (VMCI device/driver likely installed).\n";
        return out.str();
    } else return skipped_report(flag, "vmci service registry key not present.");
#elif defined(__linux__)
    struct stat st; bool exists = (stat("/dev/vmci",&st)==0);
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    out << "RAW: /dev/vmci_exists=" << (exists ? "yes":"no") << "\n";
    out << "PASS: " << (exists ? "true":"false") << "\n";
    out << "REASON: " << (exists ? "VMCI device node exists (/dev/vmci)." : "No /dev/vmci node found.") << "\n";
    return out.str();
#elif defined(__APPLE__)
    FILE* p = popen("ioreg -l 2>/dev/null | grep -i vmci || true", "r");
    if (!p) return skipped_report(flag, "ioreg unavailable.");
    char buf[256]; bool found=false; std::string accum;
    while (fgets(buf,sizeof buf,p)) { accum += buf; found=true; }
    pclose(p);
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    out << "RAW: " << (accum.size()?accum.substr(0,1024):"<none>") << "\n";
    out << "PASS: " << (found?"true":"false") << "\n";
    out << "REASON: " << (found ? "IORegistry shows VMCI-related entries." : "No VMCI entries observed in IORegistry.") << "\n";
    return out.str();
#else
    return skipped_report(flag, "Unsupported platform.");
#endif
}

// VMWARE_MAC_OUI
static std::string probe_VMWARE_MAC_OUI() {
    const std::string flag = "VM::VMWARE_MAC_OUI";
    const std::vector<std::string> vm_ouis = {"00:05:69","00:0c:29","00:50:56","00:1c:14","00:0f:4b","00:1c:42","08:00:27"}; // last is VirtualBox
#if defined(_WIN32)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    // Use GetAdaptersInfo if available (IP Helper)
    ULONG buf_len = 0;
    GetAdaptersInfo(nullptr, &buf_len); // get required size
    PIP_ADAPTER_INFO info = (PIP_ADAPTER_INFO)malloc(buf_len);
    if (!info || GetAdaptersInfo(info, &buf_len) != NO_ERROR) {
        if (info) free(info);
        return skipped_report(flag, "GetAdaptersInfo unavailable.");
    }
    bool found=false;
    for (PIP_ADAPTER_INFO p = info; p != nullptr; p = p->Next) {
        std::ostringstream macs;
        for (UINT i=0;i<p->AddressLength;i++){ if (i) macs<<":"; macs << std::hex << std::setw(2) << std::setfill('0') << (int)p->Address[i]; }
        std::string macs_s = macs.str();
        std::string low = macs_s; std::transform(low.begin(), low.end(), low.begin(), ::tolower);
        for (auto &o: vm_ouis) {
            if (low.find(o) == 0) { found=true; out << "RAW: adapter=\"" << p->Description << "\" mac=\"" << macs_s << "\"\n"; }
        }
    }
    free(info);
    out << "PASS: " << (found ? "true":"false") << "\n";
    out << "REASON: " << (found ? "Network adapter MAC OUI indicates VMware/VirtualBox vendor." : "No known VMware/VirtualBox MAC OUI detected on adapters.") << "\n";
    return out.str();
#elif defined(__linux__)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    bool found=false;
    glob_t g; if (glob("/sys/class/net/*/address",0,NULL,&g)==0) {
        for (size_t i=0;i<g.gl_pathc;i++){
            std::string mac = read_small_file(g.gl_pathv[i]);
            std::string mac_low = mac; std::transform(mac_low.begin(), mac_low.end(), mac_low.begin(), ::tolower);
            for (auto &o: vm_ouis) { if (mac_low.rfind(o,0)==0) { found=true; out << "RAW: " << g.gl_pathv[i] << " -> " << mac << "\n"; } }
        }
        globfree(&g);
    } else return skipped_report(flag, "/sys/class/net not accessible.");
    out << "PASS: " << (found?"true":"false") << "\n";
    out << "REASON: " << (found ? "One or more NIC MAC addresses match VMware/VirtualBox OUIs." : "No VMware/VirtualBox MAC OUIs found on network adapters.") << "\n";
    return out.str();
#elif defined(__APPLE__)
    FILE* p = popen("ifconfig -a 2>/dev/null", "r");
    if (!p) return skipped_report(flag, "ifconfig unavailable.");
    char buf[512]; bool found=false; std::ostringstream detail;
    while (fgets(buf,sizeof buf,p)) {
        std::string line(buf);
        for (auto &o: vm_ouis) {
            if (line.find(o) != std::string::npos) { found=true; detail << line; }
        }
    }
    pclose(p);
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    out << "RAW: " << (detail.str().size()?detail.str().substr(0,1024):"<none>") << "\n";
    out << "PASS: " << (found?"true":"false") << "\n";
    out << "REASON: " << (found? "ifconfig shows MAC OUI matching VMware/VirtualBox." : "No VMware/VirtualBox MAC OUIs found.") << "\n";
    return out.str();
#else
    return skipped_report(flag, "Unsupported platform.");
#endif
}

// VMWARE_PCI
static std::string probe_VMWARE_PCI() {
    const std::string flag = "VM::VMWARE_PCI";
#if defined(__linux__)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    glob_t g; if (glob("/sys/bus/pci/devices/*/vendor",0,NULL,&g)==0) {
        bool found=false;
        for (size_t i=0;i<g.gl_pathc;i++){
            std::string vendor = read_small_file(g.gl_pathv[i]);
            std::string devdir = std::string(g.gl_pathv[i]).substr(0, std::string(g.gl_pathv[i]).find("/vendor"));
            std::string modalias = read_small_file(devdir + "/modalias");
            out << "RAW: " << devdir << " vendor=\"" << vendor << "\" modalias=\"" << modalias << "\"\n";
            if (vendor.find("0x15ad") != std::string::npos || modalias.find("vmware")!=std::string::npos || modalias.find("vbox")!=std::string::npos) found=true;
        }
        globfree(&g);
        out << "PASS: " << (found? "true":"false") << "\n";
        out << "REASON: " << (found ? "PCI devices contain VMware/QEMU/VBox vendor identifiers." : "No obvious VM PCI vendor IDs found.") << "\n";
        return out.str();
    } else return skipped_report(flag, "/sys/bus/pci/devices not accessible.");
#elif defined(_WIN32)
    return skipped_report(flag, "Windows PCI enumeration omitted (use SetupAPI for detailed info).");
#elif defined(__APPLE__)
    FILE* p = popen("system_profiler SPPCIDataType 2>/dev/null", "r");
    if (!p) return skipped_report(flag, "system_profiler unavailable.");
    char buf[1024]; bool found=false; std::string accum;
    while (fgets(buf,sizeof buf,p)) { accum += buf; if (strstr(buf,"VMware") || strstr(buf,"VirtualBox") || strstr(buf,"QEMU")) found=true; }
    pclose(p);
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    out << "RAW: " << (accum.size()?accum.substr(0,1024):"<none>") << "\n";
    out << "PASS: " << (found?"true":"false") << "\n";
    out << "REASON: " << (found ? "system_profiler PCI report contains VM tokens." : "No VM tokens in PCI report.") << "\n";
    return out.str();
#else
    return skipped_report(flag, "Unsupported platform.");
#endif
}

// VMWARE_SVGA (subset of GPU_CAPABILITIES)
static std::string probe_VMWARE_SVGA() {
    const std::string flag = "VM::VMWARE_SVGA";
#if defined(_WIN32)
    DISPLAY_DEVICEA dd; ZeroMemory(&dd,sizeof(dd)); dd.cb = sizeof(dd);
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    bool found=false;
    for (DWORD i=0; EnumDisplayDevicesA(nullptr, i, &dd, 0); ++i) {
        std::string name = dd.DeviceString ? dd.DeviceString : "";
        if (name.find("VMware")!=std::string::npos || name.find("SVGA")!=std::string::npos) found=true;
        ZeroMemory(&dd,sizeof(dd)); dd.cb = sizeof(dd);
    }
    out << "PASS: " << (found?"true":"false") << "\n";
    out << "RAW: display_device_contains_vmware_svga=" << (found?"yes":"no") << "\n";
    out << "REASON: " << (found ? "Display adapter string suggests VMware SVGA." : "No VMware SVGA detected via EnumDisplayDevices.") << "\n";
    return out.str();
#elif defined(__linux__)
    FILE* p = popen("lspci -nn -v | grep -i 'vmware\\|svga' || true", "r");
    if (!p) return skipped_report(flag, "lspci not available.");
    char buf[512]; bool found=false; std::string accum;
    while (fgets(buf,sizeof buf,p)) { accum += buf; if (strstr(buf,"VMware") || strstr(buf,"SVGA")) found=true; }
    pclose(p);
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    out << "RAW: " << (accum.size()?accum.substr(0,1024):"<none>") << "\n";
    out << "PASS: " << (found?"true":"false") << "\n";
    out << "REASON: " << (found ? "lspci output suggests VMware SVGA." : "No VMware SVGA strings in lspci output.") << "\n";
    return out.str();
#elif defined(__APPLE__)
    return probe_GPU_CAPABILITIES();
#else
    return skipped_report(flag, "Unsupported platform.");
#endif
}

// VMWARE_BACKDOOR_TRY (skipped in safe mode)
static std::string probe_VMWARE_BACKDOOR_TRY() {
    const std::string flag = "VM::VMWARE_BACKDOOR_TRY";
#if (defined(_M_IX86) || defined(__i386__))
    return skipped_report(flag, "Backdoor detection disabled in light mode (requires 32-bit build and elevated privileges).");
#else
    return skipped_report(flag, "Backdoor detection requires 32-bit build; skipped on x64.");
#endif
}

// VMWARE_FILES
static std::string probe_VMWARE_FILES() {
    const std::string flag = "VM::VMWARE_FILES";
#if defined(_WIN32)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    const char* paths[] = {
        "C:\\Program Files\\VMware\\VMware Tools\\vmtoolsd.exe",
        "C:\\Program Files (x86)\\VMware\\VMware Tools\\vmtoolsd.exe",
        "C:\\Windows\\System32\\drivers\\vmmouse.sys",
        "C:\\Windows\\System32\\drivers\\vmhgfs.sys"
    };
    bool found=false; out << "RAW: existing_paths=[";
    for (size_t i=0;i<sizeof(paths)/sizeof(paths[0]);++i) {
        DWORD a = GetFileAttributesA(paths[i]);
        if (a != INVALID_FILE_ATTRIBUTES) { found=true; out << paths[i] << (i+1<sizeof(paths)/sizeof(paths[0])? ",":""); }
    }
    out << "]\n";
    out << "PASS: " << (found? "true":"false") << "\n";
    out << "REASON: " << (found ? "VMware-specific files/drivers present." : "No common VMware files detected in default locations.") << "\n";
    return out.str();
#elif defined(__linux__)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    bool found=false;
    const char* paths[] = { "/usr/bin/vmtoolsd", "/usr/sbin/vmtoolsd", "/usr/bin/vmware-user", "/lib/modules/vmhgfs.ko" };
    out << "RAW: existing_paths=[";
    for (size_t i=0;i<sizeof(paths)/sizeof(paths[0]);++i) {
        std::ifstream f(paths[i]);
        if (f.good()) { found=true; out << paths[i] << (i+1<sizeof(paths)/sizeof(paths[0])? ",":""); }
    }
    out << "]\n";
    out << "PASS: " << (found? "true":"false") << "\n";
    out << "REASON: " << (found ? "VMware-related binaries/modules present." : "No common VMware files in standard locations.") << "\n";
    return out.str();
#elif defined(__APPLE__)
    std::ostringstream out; out << "FLAG: " << flag << "\n";
    bool found=false; std::ifstream f("/Library/Application Support/VMware Tools/vmtoolsd");
    if (f.good()) found=true;
    out << "RAW: path_exists=" << (found?"yes":"no") << "\n";
    out << "PASS: " << (found?"true":"false") << "\n";
    out << "REASON: " << (found ? "VMware Tools files present in /Library/Application Support." : "No VMware Tools files found in standard macOS path.") << "\n";
    return out.str();
#else
    return skipped_report(flag, "Unsupported platform.");
#endif
}

// ----------------- Public mapping -----------------

std::string GetFlagReport(const std::string& flagName) {
    // New/VMware flags
    if (flagName == "VM::VMWARE_SMBIOS") return probe_VMWARE_SMBIOS();
    if (flagName == "VM::VMWARE_TOOLS") return probe_VMWARE_TOOLS();
    if (flagName == "VM::VMCI_DEVICE") return probe_VMCI_DEVICE();
    if (flagName == "VM::VMWARE_MAC_OUI") return probe_VMWARE_MAC_OUI();
    if (flagName == "VM::VMWARE_PCI") return probe_VMWARE_PCI();
    if (flagName == "VM::VMWARE_SVGA") return probe_VMWARE_SVGA();
    if (flagName == "VM::VMWARE_BACKDOOR_TRY") return probe_VMWARE_BACKDOOR_TRY();
    if (flagName == "VM::VMWARE_FILES") return probe_VMWARE_FILES();

    // Previously added skipped flags
    if (flagName == "VM::GPU_CAPABILITIES") return probe_GPU_CAPABILITIES();
    if (flagName == "VM::POWER_CAPABILITIES") return probe_POWER_CAPABILITIES();
    if (flagName == "VM::DISK_SERIAL") return probe_DISK_SERIAL();
    if (flagName == "VM::DRIVERS") return probe_DRIVERS();
    if (flagName == "VM::DEVICE_HANDLES") return probe_DEVICE_HANDLES();
    if (flagName == "VM::VIRTUAL_PROCESSORS") return probe_VIRTUAL_PROCESSORS();
    if (flagName == "VM::REGISTRY_KEYS") return probe_REGISTRY_KEYS();
    if (flagName == "VM::TRAP") return probe_TRAP();
    if (flagName == "VM::SMBIOS_PASSTHROUGH") return probe_SMBIOS_PASSTHROUGH();
    if (flagName == "VM::BOOT_LOGO") return probe_BOOT_LOGO();
    if (flagName == "VM::FIRMWARE") return probe_FIRMWARE();
    if (flagName == "VM::PCI_DEVICES") return probe_PCI_DEVICES();
    if (flagName == "VM::TIMER") return probe_TIMER();
    if (flagName == "VM::HYPERVISOR_STR") return probe_HYPERVISOR_STR();

    // Core flags
    if (flagName == "VM::HYPERVISOR_BIT") return probe_HYPERVISOR_BIT();
    if (flagName == "VM::VMID") return probe_VMID();
    if (flagName == "VM::VMID_0X4") return probe_VMID_0X4();
    if (flagName == "VM::CPUID_SIGNATURE") return probe_CPUID_SIGNATURE();
    if (flagName == "VM::QEMU_BRAND" || flagName == "VM::BOCHS_CPU") return probe_QEMU_BRAND();
    if (flagName == "VM::INTEL_THREAD_MISMATCH" || flagName == "VM::XEON_THREAD_MISMATCH" || flagName == "VM::AMD_THREAD_MISMATCH")
        return probe_INTEL_THREAD_MISMATCH();
    if (flagName == "VM::MSSMBIOS") return probe_MSSMBIOS();
    if (flagName == "VM::SETUPAPI_DISK") return probe_SETUPAPI_DISK();
    if (flagName == "VM::VBOX_NETWORK") return probe_VBOX_NETWORK();
    if (flagName == "VM::WINE_CHECK") return probe_WINE_CHECK();
    if (flagName == "VM::HYPERV_QUERY") return probe_HYPERV_QUERY();
    if (flagName == "VM::NETTITUDE_VM_MEMORY") return probe_NETTITUDE_VM_MEMORY();
    if (flagName == "VM::VMWARE_BACKDOOR") return probe_VMWARE_BACKDOOR();
    if (flagName == "VM::NATIVE_VHD") return probe_NATIVE_VHD();
    if (flagName == "VM::FIRMWARE_SCAN") return probe_FIRMWARE_SCAN();

    // Unknown
    std::ostringstream out;
    out << "FLAG: " << flagName << "\n";
    out << "PASS: skipped\n";
    out << "RAW: <unknown flag>\n";
    out << "REASON: The requested flag is not recognized by this helper. Add a probe implementation for this flag.\n";
    out << "NOTE: Supported flags include many VM::* tokens; extend mapping as needed.\n";
    return out.str();
}

} // namespace vmreason
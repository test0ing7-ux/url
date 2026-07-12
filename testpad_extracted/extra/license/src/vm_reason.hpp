#pragma once
#include <string>

namespace vmreason {
    // Main API: get a plain-text report for a single VMAware flag.
    // flagName must match VMAware names, e.g. "VM::HYPERVISOR_BIT", "VM::VMID", "VM::MSSMBIOS", "VM::FIRMWARE_SCAN", ...
    // Returns a human-readable, plain-text block. If the probe cannot run (permission/arch), it will return a "skipped" note.
    std::string GetFlagReport(const std::string& flagName);
}
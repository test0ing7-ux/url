cmake_minimum_required(VERSION 3.15)

project(vm-detect)

if(MSVC)
    set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
endif()

find_package(OpenSSL REQUIRED)

if(WIN32)
    if(CMAKE_SIZEOF_VOID_P EQUAL 8)
        set(PLATFORM_SUFFIX "win32-x64")
    else()
        set(PLATFORM_SUFFIX "win32-ia32")
    endif()
elseif(APPLE)
    if(CMAKE_SYSTEM_PROCESSOR STREQUAL "arm64")
        set(PLATFORM_SUFFIX "darwin-arm64")
    else()
        set(PLATFORM_SUFFIX "darwin-x64")
    endif()
else()
    set(PLATFORM_SUFFIX "linux-x64")
endif()

add_executable(vm-detect src/vm-detect.cpp src/vm_reason.cpp)

target_compile_features(vm-detect PRIVATE cxx_std_20)
target_include_directories(vm-detect PRIVATE src)
target_link_libraries(vm-detect PRIVATE OpenSSL::Crypto)

if(APPLE)
    target_compile_options(vm-detect PRIVATE -stdlib=libc++)
    target_link_options(vm-detect PRIVATE -stdlib=libc++)
    target_link_libraries(vm-detect PRIVATE "-framework Security" "-framework CoreFoundation")
endif()

set_target_properties(vm-detect PROPERTIES
    OUTPUT_NAME "license-${PLATFORM_SUFFIX}"
)

add_custom_command(TARGET vm-detect POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_SOURCE_DIR}/build
    COMMAND ${CMAKE_COMMAND} -E copy $<TARGET_FILE:vm-detect> ${CMAKE_SOURCE_DIR}/build/
    COMMENT "Copying to build/"
)
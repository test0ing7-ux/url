// aes-gcm.hpp
#pragma once

#include <openssl/evp.h>
#include <openssl/rand.h>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <vector>

inline void aesGcmSha256Bytes(const uint8_t *data, size_t len, uint8_t out[32])
{
    EVP_MD_CTX *ctx = EVP_MD_CTX_new();
    unsigned int out_len = 0;

    if (!ctx) {
        throw std::runtime_error("EVP_MD_CTX_new failed");
    }

    const bool ok =
        EVP_DigestInit_ex(ctx, EVP_sha256(), nullptr) == 1 &&
        EVP_DigestUpdate(ctx, data, len) == 1 &&
        EVP_DigestFinal_ex(ctx, out, &out_len) == 1 &&
        out_len == 32;

    EVP_MD_CTX_free(ctx);

    if (!ok) {
        throw std::runtime_error("SHA256 failed");
    }
}

inline std::string aesGcmBase64Encode(const uint8_t *data, size_t len)
{
    static const char *table =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    std::string out;
    out.reserve(((len + 2) / 3) * 4);

    for (size_t i = 0; i < len; i += 3) {
        uint32_t value = static_cast<uint32_t>(data[i]) << 16;
        if (i + 1 < len) {
            value |= static_cast<uint32_t>(data[i + 1]) << 8;
        }
        if (i + 2 < len) {
            value |= static_cast<uint32_t>(data[i + 2]);
        }

        out.push_back(table[(value >> 18) & 0x3F]);
        out.push_back(table[(value >> 12) & 0x3F]);
        out.push_back(i + 1 < len ? table[(value >> 6) & 0x3F] : '=');
        out.push_back(i + 2 < len ? table[value & 0x3F] : '=');
    }

    return out;
}

inline std::string aesGcmEncrypt(const std::string &plaintext, const std::string &keySeed)
{
    uint8_t key[32];
    aesGcmSha256Bytes(
        reinterpret_cast<const uint8_t *>(keySeed.data()),
        keySeed.size(),
        key);

    uint8_t nonce[12];
    if (RAND_bytes(nonce, sizeof(nonce)) != 1) {
        throw std::runtime_error("RAND_bytes failed");
    }

    std::vector<uint8_t> ciphertext(plaintext.size());
    uint8_t tag[16];

    EVP_CIPHER_CTX *ctx = EVP_CIPHER_CTX_new();
    if (!ctx) {
        throw std::runtime_error("EVP_CIPHER_CTX_new failed");
    }

    int out_len = 0;
    int final_len = 0;

    const bool ok =
        EVP_EncryptInit_ex(ctx, EVP_aes_256_gcm(), nullptr, nullptr, nullptr) == 1 &&
        EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_IVLEN, sizeof(nonce), nullptr) == 1 &&
        EVP_EncryptInit_ex(ctx, nullptr, nullptr, key, nonce) == 1 &&
        EVP_EncryptUpdate(
            ctx,
            ciphertext.data(),
            &out_len,
            reinterpret_cast<const unsigned char *>(plaintext.data()),
            static_cast<int>(plaintext.size())) == 1 &&
        EVP_EncryptFinal_ex(ctx, ciphertext.data() + out_len, &final_len) == 1 &&
        EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_GET_TAG, sizeof(tag), tag) == 1;

    EVP_CIPHER_CTX_free(ctx);

    if (!ok) {
        throw std::runtime_error("OpenSSL AES-256-GCM encryption failed");
    }

    ciphertext.resize(static_cast<size_t>(out_len + final_len));

    std::vector<uint8_t> bundle;
    bundle.reserve(sizeof(nonce) + ciphertext.size() + sizeof(tag));
    bundle.insert(bundle.end(), nonce, nonce + sizeof(nonce));
    bundle.insert(bundle.end(), ciphertext.begin(), ciphertext.end());
    bundle.insert(bundle.end(), tag, tag + sizeof(tag));

    return aesGcmBase64Encode(bundle.data(), bundle.size());
}

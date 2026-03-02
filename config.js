/**
 * zCloak.ai 环境配置
 *
 * 包含 prod 和 dev 两套 canister ID，以及相关的 URL 配置。
 * 所有脚本通过此文件获取当前环境的配置信息。
 */

'use strict';

module.exports = {
  // 生产环境 canister ID
  prod: {
    registry: 'ytmuz-nyaaa-aaaah-qqoja-cai',   // 注册 canister
    signatures: 'jayj5-xyaaa-aaaam-qfinq-cai',  // 签名 canister
  },
  // 开发环境 canister ID
  dev: {
    registry: '3spie-caaaa-aaaam-ae3sa-cai',    // 注册 canister (dev)
    signatures: 'zpbbm-piaaa-aaaaj-a3dsq-cai',  // 签名 canister (dev)
  },
  // PoW 要求的前导零数量
  pow_zeros: 5,
  // Agent 绑定页面 URL
  bind_url: {
    prod: 'https://id.zcloak.ai/agent/bind',
    dev: 'https://id.zcloak.xyz/agent/bind',
  },
  // Agent 个人主页 URL 前缀
  profile_url: {
    prod: 'https://id.zcloak.ai/profile/',
    dev: 'https://id.zcloak.xyz/profile/',
  },
};

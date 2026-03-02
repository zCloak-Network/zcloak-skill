/**
 * zCloak.ai IC Agent 工厂模块
 *
 * 创建和管理与 ICP canister 的连接。
 * 参考 src/lib/canister/agent.ts 设计，但适配独立脚本环境。
 *
 * 功能:
 *   getSignActor()     → 签名 canister Actor（带身份，支持 update call）
 *   getRegistryActor() → 注册 canister Actor（带身份，支持 update call）
 *   getAnonymousSignActor()     → 匿名签名 canister Actor（仅 query）
 *   getAnonymousRegistryActor() → 匿名注册 canister Actor（仅 query）
 */

'use strict';

const { HttpAgent, Actor } = require('@dfinity/agent');
const { signIdlFactory, registryIdlFactory } = require('./idl');
const { loadIdentity } = require('./identity');
const { getCanisterIds } = require('./utils');

/** IC 主网地址 */
const IC_HOST = 'https://ic0.app';

// ========== Agent 缓存 ==========

/** 带身份的 Agent（用于 update call） */
let _authenticatedAgent = null;

/** 匿名 Agent（用于 query） */
let _anonymousAgent = null;

// ========== Agent 创建 ==========

/**
 * 获取带身份的 HttpAgent（用于签名/写入操作）
 * @returns {Promise<import('@dfinity/agent').HttpAgent>}
 */
async function getAuthenticatedAgent() {
  if (!_authenticatedAgent) {
    const identity = loadIdentity();
    _authenticatedAgent = await HttpAgent.create({
      host: IC_HOST,
      identity,
    });
  }
  return _authenticatedAgent;
}

/**
 * 获取匿名 HttpAgent（用于只读查询操作）
 * @returns {Promise<import('@dfinity/agent').HttpAgent>}
 */
async function getAnonymousAgent() {
  if (!_anonymousAgent) {
    _anonymousAgent = await HttpAgent.create({
      host: IC_HOST,
    });
  }
  return _anonymousAgent;
}

// ========== Actor 工厂 ==========

/**
 * 获取签名 canister Actor（带身份，支持 update call）
 * @returns {Promise<import('@dfinity/agent').ActorSubclass>}
 */
async function getSignActor() {
  const agent = await getAuthenticatedAgent();
  const canisters = getCanisterIds();
  return Actor.createActor(signIdlFactory, {
    agent,
    canisterId: canisters.signatures,
  });
}

/**
 * 获取注册 canister Actor（带身份，支持 update call）
 * @returns {Promise<import('@dfinity/agent').ActorSubclass>}
 */
async function getRegistryActor() {
  const agent = await getAuthenticatedAgent();
  const canisters = getCanisterIds();
  return Actor.createActor(registryIdlFactory, {
    agent,
    canisterId: canisters.registry,
  });
}

/**
 * 获取匿名签名 canister Actor（仅 query，无需身份）
 * @returns {Promise<import('@dfinity/agent').ActorSubclass>}
 */
async function getAnonymousSignActor() {
  const agent = await getAnonymousAgent();
  const canisters = getCanisterIds();
  return Actor.createActor(signIdlFactory, {
    agent,
    canisterId: canisters.signatures,
  });
}

/**
 * 获取匿名注册 canister Actor（仅 query，无需身份）
 * @returns {Promise<import('@dfinity/agent').ActorSubclass>}
 */
async function getAnonymousRegistryActor() {
  const agent = await getAnonymousAgent();
  const canisters = getCanisterIds();
  return Actor.createActor(registryIdlFactory, {
    agent,
    canisterId: canisters.registry,
  });
}

/**
 * 重置所有 Agent 和 Actor 缓存（用于错误恢复）
 */
function resetAgents() {
  _authenticatedAgent = null;
  _anonymousAgent = null;
}

module.exports = {
  getSignActor,
  getRegistryActor,
  getAnonymousSignActor,
  getAnonymousRegistryActor,
  resetAgents,
  IC_HOST,
};

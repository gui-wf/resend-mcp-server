/**
 * Unit tests for Tool Registry
 *
 * Tests dynamic tool loading, tier management, scope filtering, and registry operations.
 *
 * @module tests/unit/tool-registry
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  initializeRegistry,
  registerTool,
  unregisterTool,
  loadTier,
  unloadTier,
  loadByScope,
  unloadByScope,
  getEnabledTools,
  isToolEnabled,
  getTool,
  getToolExecutor,
  getRegistryStats,
  resetRegistry,
  enableTool,
  disableTool,
  type ToolDefinition,
  type ToolResponse,
} from "../../src/services/tool-registry.js";

// Mock server for notifications
const mockServer = {
  notification: vi.fn().mockResolvedValue(undefined),
};

// Helper to create test tool definitions
function createTestTool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: "test_tool",
    description: "A test tool",
    inputSchema: {
      type: "object",
      properties: {},
    },
    tier: "core",
    scopes: ["read"],
    execute: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "success" }],
    } as ToolResponse),
    ...overrides,
  };
}

describe("tool-registry", () => {
  beforeEach(() => {
    // Reset registry before each test
    resetRegistry();
    vi.clearAllMocks();
  });

  describe("initializeRegistry", () => {
    it("should initialize with empty tool list", () => {
      initializeRegistry(mockServer as never);
      const stats = getRegistryStats();
      expect(stats.totalRegistered).toBe(0);
      expect(stats.totalEnabled).toBe(0);
    });

    it("should initialize with provided tools", () => {
      const tools = [
        createTestTool({ name: "tool1" }),
        createTestTool({ name: "tool2" }),
      ];
      initializeRegistry(mockServer as never, tools);
      const stats = getRegistryStats();
      expect(stats.totalRegistered).toBe(2);
    });
  });

  describe("registerTool", () => {
    beforeEach(() => {
      initializeRegistry(mockServer as never);
    });

    it("should register a tool", () => {
      const tool = createTestTool({ name: "my_tool" });
      registerTool(tool);
      expect(getTool("my_tool")).toEqual(tool);
    });

    it("should assign tool to correct tier", () => {
      registerTool(createTestTool({ name: "core_tool", tier: "core" }));
      registerTool(createTestTool({ name: "secondary_tool", tier: "secondary" }));
      registerTool(createTestTool({ name: "tertiary_tool", tier: "tertiary" }));

      const stats = getRegistryStats();
      expect(stats.byTier.core).toBe(1);
      expect(stats.byTier.secondary).toBe(1);
      expect(stats.byTier.tertiary).toBe(1);
    });

    it("should overwrite existing tool with warning", () => {
      const tool1 = createTestTool({ name: "dup_tool", description: "first" });
      const tool2 = createTestTool({ name: "dup_tool", description: "second" });

      registerTool(tool1);
      registerTool(tool2);

      const retrieved = getTool("dup_tool");
      expect(retrieved?.description).toBe("second");
    });
  });

  describe("unregisterTool", () => {
    beforeEach(() => {
      initializeRegistry(mockServer as never);
      registerTool(createTestTool({ name: "to_remove" }));
    });

    it("should remove a registered tool", () => {
      expect(getTool("to_remove")).toBeDefined();
      unregisterTool("to_remove");
      expect(getTool("to_remove")).toBeUndefined();
    });

    it("should do nothing for non-existent tool", () => {
      unregisterTool("nonexistent");
      const stats = getRegistryStats();
      expect(stats.totalRegistered).toBe(1);
    });

    it("should remove tool from enabled set", async () => {
      await enableTool("to_remove");
      expect(isToolEnabled("to_remove")).toBe(true);
      unregisterTool("to_remove");
      expect(isToolEnabled("to_remove")).toBe(false);
    });
  });

  describe("loadTier", () => {
    beforeEach(() => {
      initializeRegistry(mockServer as never, [
        createTestTool({ name: "core1", tier: "core" }),
        createTestTool({ name: "core2", tier: "core" }),
        createTestTool({ name: "secondary1", tier: "secondary" }),
        createTestTool({ name: "tertiary1", tier: "tertiary" }),
      ]);
    });

    it("should load only core tools for core tier", async () => {
      await loadTier("core");
      const stats = getRegistryStats();
      expect(stats.totalEnabled).toBe(2);
      expect(stats.enabledTools).toContain("core1");
      expect(stats.enabledTools).toContain("core2");
      expect(stats.enabledTools).not.toContain("secondary1");
    });

    it("should load core + secondary tools for secondary tier", async () => {
      await loadTier("secondary");
      const stats = getRegistryStats();
      expect(stats.totalEnabled).toBe(3);
      expect(stats.enabledTools).toContain("core1");
      expect(stats.enabledTools).toContain("secondary1");
      expect(stats.enabledTools).not.toContain("tertiary1");
    });

    it("should load all tools for tertiary tier", async () => {
      await loadTier("tertiary");
      const stats = getRegistryStats();
      expect(stats.totalEnabled).toBe(4);
      expect(stats.enabledTools).toContain("tertiary1");
    });

    it("should send notification on load", async () => {
      await loadTier("core");
      expect(mockServer.notification).toHaveBeenCalledWith({
        method: "notifications/tools/list_changed",
      });
    });
  });

  describe("unloadTier", () => {
    beforeEach(async () => {
      initializeRegistry(mockServer as never, [
        createTestTool({ name: "core1", tier: "core" }),
        createTestTool({ name: "secondary1", tier: "secondary" }),
        createTestTool({ name: "tertiary1", tier: "tertiary" }),
      ]);
      await loadTier("tertiary"); // Start with all loaded
      vi.clearAllMocks();
    });

    it("should unload tertiary tools", async () => {
      await unloadTier("tertiary");
      const stats = getRegistryStats();
      expect(stats.enabledTools).not.toContain("tertiary1");
      expect(stats.enabledTools).toContain("secondary1");
      expect(stats.enabledTools).toContain("core1");
    });

    it("should unload secondary and tertiary when unloading secondary", async () => {
      await unloadTier("secondary");
      const stats = getRegistryStats();
      expect(stats.enabledTools).not.toContain("tertiary1");
      expect(stats.enabledTools).not.toContain("secondary1");
      expect(stats.enabledTools).toContain("core1");
    });

    it("should unload all tiers when unloading core", async () => {
      await unloadTier("core");
      const stats = getRegistryStats();
      expect(stats.totalEnabled).toBe(0);
    });

    it("should send notification on unload", async () => {
      await unloadTier("tertiary");
      expect(mockServer.notification).toHaveBeenCalled();
    });
  });

  describe("loadByScope", () => {
    beforeEach(() => {
      initializeRegistry(mockServer as never, [
        createTestTool({ name: "read_tool", scopes: ["read"] }),
        createTestTool({ name: "write_tool", scopes: ["write"] }),
        createTestTool({ name: "admin_tool", scopes: ["admin"] }),
        createTestTool({ name: "read_write_tool", scopes: ["read", "write"] }),
      ]);
    });

    it("should load tools matching any provided scope", async () => {
      await loadByScope(["read"]);
      const stats = getRegistryStats();
      expect(stats.enabledTools).toContain("read_tool");
      expect(stats.enabledTools).toContain("read_write_tool");
      expect(stats.enabledTools).not.toContain("write_tool");
    });

    it("should load tools matching multiple scopes", async () => {
      await loadByScope(["read", "write"]);
      const stats = getRegistryStats();
      expect(stats.enabledTools).toContain("read_tool");
      expect(stats.enabledTools).toContain("write_tool");
      expect(stats.enabledTools).toContain("read_write_tool");
      expect(stats.enabledTools).not.toContain("admin_tool");
    });
  });

  describe("unloadByScope", () => {
    beforeEach(async () => {
      initializeRegistry(mockServer as never, [
        createTestTool({ name: "read_tool", scopes: ["read"] }),
        createTestTool({ name: "write_tool", scopes: ["write"] }),
        createTestTool({ name: "read_write_tool", scopes: ["read", "write"] }),
      ]);
      await loadByScope(["read", "write"]);
      vi.clearAllMocks();
    });

    it("should unload tools with ALL matching scopes", async () => {
      await unloadByScope(["read"]);
      const stats = getRegistryStats();
      // read_tool has only 'read' scope, so it gets unloaded
      expect(stats.enabledTools).not.toContain("read_tool");
      // read_write_tool has both, so it stays (not all its scopes are in the unload list)
      expect(stats.enabledTools).toContain("read_write_tool");
      expect(stats.enabledTools).toContain("write_tool");
    });

    it("should unload tools matching all provided scopes", async () => {
      await unloadByScope(["read", "write"]);
      const stats = getRegistryStats();
      expect(stats.enabledTools).not.toContain("read_tool");
      expect(stats.enabledTools).not.toContain("write_tool");
      expect(stats.enabledTools).not.toContain("read_write_tool");
    });
  });

  describe("getEnabledTools", () => {
    beforeEach(async () => {
      initializeRegistry(mockServer as never, [
        createTestTool({
          name: "visible_tool",
          description: "A visible tool",
          annotations: { title: "Visible" },
        }),
      ]);
      await loadTier("core");
    });

    it("should return MCP tool definitions for enabled tools", () => {
      const tools = getEnabledTools();
      expect(tools).toHaveLength(1);
      expect(tools[0]).toEqual({
        name: "visible_tool",
        description: "A visible tool",
        inputSchema: { type: "object", properties: {} },
        annotations: { title: "Visible" },
      });
    });

    it("should not include tier, scopes, or execute in returned definitions", () => {
      const tools = getEnabledTools();
      const tool = tools[0] as unknown as Record<string, unknown>;
      expect(tool.tier).toBeUndefined();
      expect(tool.scopes).toBeUndefined();
      expect(tool.execute).toBeUndefined();
    });
  });

  describe("isToolEnabled", () => {
    beforeEach(async () => {
      initializeRegistry(mockServer as never, [
        createTestTool({ name: "enabled_tool" }),
        createTestTool({ name: "disabled_tool" }),
      ]);
      await enableTool("enabled_tool");
    });

    it("should return true for enabled tool", () => {
      expect(isToolEnabled("enabled_tool")).toBe(true);
    });

    it("should return false for disabled tool", () => {
      expect(isToolEnabled("disabled_tool")).toBe(false);
    });

    it("should return false for non-existent tool", () => {
      expect(isToolEnabled("nonexistent")).toBe(false);
    });
  });

  describe("getTool", () => {
    beforeEach(() => {
      initializeRegistry(mockServer as never, [
        createTestTool({ name: "my_tool" }),
      ]);
    });

    it("should return tool definition", () => {
      const tool = getTool("my_tool");
      expect(tool).toBeDefined();
      expect(tool?.name).toBe("my_tool");
    });

    it("should return undefined for non-existent tool", () => {
      expect(getTool("nonexistent")).toBeUndefined();
    });
  });

  describe("getToolExecutor", () => {
    const mockExecute = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "result" }],
    });

    beforeEach(async () => {
      initializeRegistry(mockServer as never, [
        createTestTool({ name: "executable_tool", execute: mockExecute }),
      ]);
      await enableTool("executable_tool");
    });

    it("should return executor for enabled tool", () => {
      const executor = getToolExecutor("executable_tool");
      expect(executor).toBe(mockExecute);
    });

    it("should return undefined for disabled tool", async () => {
      await disableTool("executable_tool");
      expect(getToolExecutor("executable_tool")).toBeUndefined();
    });

    it("should return undefined for non-existent tool", () => {
      expect(getToolExecutor("nonexistent")).toBeUndefined();
    });
  });

  describe("enableTool / disableTool", () => {
    beforeEach(() => {
      initializeRegistry(mockServer as never, [
        createTestTool({ name: "toggle_tool" }),
      ]);
    });

    it("should enable a registered tool", async () => {
      const result = await enableTool("toggle_tool");
      expect(result).toBe(true);
      expect(isToolEnabled("toggle_tool")).toBe(true);
    });

    it("should return true for already enabled tool", async () => {
      await enableTool("toggle_tool");
      const result = await enableTool("toggle_tool");
      expect(result).toBe(true);
    });

    it("should return false for non-existent tool", async () => {
      const result = await enableTool("nonexistent");
      expect(result).toBe(false);
    });

    it("should disable an enabled tool", async () => {
      await enableTool("toggle_tool");
      const result = await disableTool("toggle_tool");
      expect(result).toBe(true);
      expect(isToolEnabled("toggle_tool")).toBe(false);
    });

    it("should return true for already disabled tool", async () => {
      const result = await disableTool("toggle_tool");
      expect(result).toBe(true);
    });

    it("should send notification on enable/disable", async () => {
      await enableTool("toggle_tool");
      expect(mockServer.notification).toHaveBeenCalled();
      vi.clearAllMocks();
      await disableTool("toggle_tool");
      expect(mockServer.notification).toHaveBeenCalled();
    });
  });

  describe("getRegistryStats", () => {
    beforeEach(async () => {
      initializeRegistry(mockServer as never, [
        createTestTool({ name: "core1", tier: "core" }),
        createTestTool({ name: "core2", tier: "core" }),
        createTestTool({ name: "secondary1", tier: "secondary" }),
        createTestTool({ name: "tertiary1", tier: "tertiary" }),
      ]);
      await loadTier("secondary"); // Loads core + secondary
    });

    it("should return correct total counts", () => {
      const stats = getRegistryStats();
      expect(stats.totalRegistered).toBe(4);
      expect(stats.totalEnabled).toBe(3);
    });

    it("should return correct tier counts", () => {
      const stats = getRegistryStats();
      expect(stats.byTier.core).toBe(2);
      expect(stats.byTier.secondary).toBe(1);
      expect(stats.byTier.tertiary).toBe(1);
    });

    it("should return correct enabled tier counts", () => {
      const stats = getRegistryStats();
      expect(stats.enabledByTier.core).toBe(2);
      expect(stats.enabledByTier.secondary).toBe(1);
      expect(stats.enabledByTier.tertiary).toBe(0);
    });

    it("should list enabled tool names", () => {
      const stats = getRegistryStats();
      expect(stats.enabledTools).toContain("core1");
      expect(stats.enabledTools).toContain("core2");
      expect(stats.enabledTools).toContain("secondary1");
      expect(stats.enabledTools).not.toContain("tertiary1");
    });
  });

  describe("resetRegistry", () => {
    it("should clear all registered tools", async () => {
      initializeRegistry(mockServer as never, [
        createTestTool({ name: "tool1" }),
        createTestTool({ name: "tool2" }),
      ]);
      await loadTier("core");

      resetRegistry();

      const stats = getRegistryStats();
      expect(stats.totalRegistered).toBe(0);
      expect(stats.totalEnabled).toBe(0);
    });
  });

  describe("notification handling", () => {
    it("should handle notification failure gracefully", async () => {
      const failingServer = {
        notification: vi.fn().mockRejectedValue(new Error("Notification failed")),
      };
      initializeRegistry(failingServer as never, [
        createTestTool({ name: "tool1" }),
      ]);

      // Should not throw
      await expect(loadTier("core")).resolves.not.toThrow();
    });

    it("should log warning when no server instance", async () => {
      resetRegistry();
      registerTool(createTestTool({ name: "orphan_tool" }));

      // Should not throw without server
      await expect(enableTool("orphan_tool")).resolves.toBe(true);
    });
  });
});

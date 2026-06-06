/**
 * Smoke test — verifies all realtime modules can be imported and
 * their public surface matches what the rest of the codebase
 * depends on. Run with:
 *   cd apps/api && tsx scripts/realtime-smoke.ts
 */

import { setupWebSocket, tryGetIO, getWebSocketStatus } from "../src/plugins/websocket.js";
import { realtimeService } from "../src/services/realtime.service.js";
import { notificationService } from "../src/services/notification.service.js";
import { statsBroadcastJob } from "../src/queues/stats-broadcast.queue.js";
import { notificationRoutes } from "../src/routes/notifications.js";
import { ListNotificationsQuerySchema } from "../src/schemas/notification.schema.js";

let passed = 0;
let failed = 0;
function expect(label: string, cond: unknown): void {
  if (cond) {
    passed += 1;
    console.log(`  \u2713 ${label}`);
  } else {
    failed += 1;
    console.error(`  \u2717 ${label}`);
  }
}

console.log("WebSocket plugin:");
expect("setupWebSocket exported", typeof setupWebSocket === "function");
expect("tryGetIO exported", typeof tryGetIO === "function");
expect("getWebSocketStatus exported", typeof getWebSocketStatus === "function");
expect("tryGetIO returns null when not set up", tryGetIO() === null);

console.log("Realtime service:");
expect("emitLeadCreated", typeof realtimeService.emitLeadCreated === "function");
expect("emitLeadUpdated", typeof realtimeService.emitLeadUpdated === "function");
expect("emitLeadAssigned", typeof realtimeService.emitLeadAssigned === "function");
expect("emitLeadStatusChanged", typeof realtimeService.emitLeadStatusChanged === "function");
expect("emitCustomerCreated", typeof realtimeService.emitCustomerCreated === "function");
expect("emitDealStageChanged", typeof realtimeService.emitDealStageChanged === "function");
expect("emitDealDelivered", typeof realtimeService.emitDealDelivered === "function");
expect("emitVehicleSold", typeof realtimeService.emitVehicleSold === "function");
expect("emitVehiclePriceChanged", typeof realtimeService.emitVehiclePriceChanged === "function");
expect("emitTestDriveScheduled", typeof realtimeService.emitTestDriveScheduled === "function");
expect("emitTestDriveCompleted", typeof realtimeService.emitTestDriveCompleted === "function");
expect("emitNotification", typeof realtimeService.emitNotification === "function");
expect("emitStatsUpdate", typeof realtimeService.emitStatsUpdate === "function");

console.log("Notification service:");
expect("create", typeof notificationService.create === "function");
expect("findExisting", typeof notificationService.findExisting === "function");
expect("list", typeof notificationService.list === "function");
expect("unreadCount", typeof notificationService.unreadCount === "function");
expect("markRead", typeof notificationService.markRead === "function");
expect("markAllRead", typeof notificationService.markAllRead === "function");
expect("delete", typeof notificationService.delete === "function");
expect("toDTO", typeof notificationService.toDTO === "function");

console.log("Notification routes:");
expect("notificationRoutes exported", typeof notificationRoutes === "function");

console.log("Notification schema:");
expect("ListNotificationsQuerySchema accepts empty input", ListNotificationsQuerySchema.safeParse({}).success);
expect("ListNotificationsQuerySchema accepts full input", ListNotificationsQuerySchema.safeParse({
  cursor: "abc",
  limit: 10,
  unreadOnly: "true",
  type: "LEAD_ASSIGNED",
}).success);
expect("ListNotificationsQuerySchema rejects bad limit", !ListNotificationsQuerySchema.safeParse({ limit: 999 }).success);

console.log("Stats broadcast queue:");
expect("statsBroadcastJob.start", typeof statsBroadcastJob.start === "function");
expect("statsBroadcastJob.stop", typeof statsBroadcastJob.stop === "function");
expect("statsBroadcastJob.broadcastNow", typeof statsBroadcastJob.broadcastNow === "function");
expect("isEnabled respects env", statsBroadcastJob.isEnabled() === (process.env.STATS_BROADCAST_DISABLED !== "true"));
expect("getIntervalMs > 0", statsBroadcastJob.getIntervalMs() > 0);

console.log("");
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

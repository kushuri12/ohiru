// Hiru Overpowered Skill: system_monitor_v498
// Description: Monitors CPU, RAM, and Disk usage.
// Generated at: 2026-04-18T11:10:32.367Z

import os from "os"; export default async () => { return `CPU: ${os.loadavg()}, Free RAM: ${os.freemem() / 1024 / 1024}MB`; }

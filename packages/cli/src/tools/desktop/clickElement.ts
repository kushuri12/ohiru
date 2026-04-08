import { z } from "zod";

export const clickElementTool: any = {
  description: `Click a UI element by its NAME without needing coordinates.
This tool combines inspect_ui + move_mouse in one step.
Use this FIRST before trying coordinate-based clicking.
element_name: the exact "Name" field from inspect_ui output (case-insensitive substring match ok).`,

  parameters: z.object({
    element_name: z.string().describe("Name or partial name of the button/input/link to click"),
    action: z.enum(["click", "double_click", "right_click"]).default("click"),
    match_type: z.enum(["contains", "exact"]).default("contains"),
  }),

  execute: async (args: any) => {
    const { element_name, action = "click", match_type = "contains" } = args;
    const { execa } = await import("execa");
    const robot = await import("@nut-tree-fork/nut-js");
    const { mouse, Button, straightTo, Point } = robot;

    // PowerShell: find element by name
    const script = `
Add-Type -AssemblyName UIAutomationClient
$root = [Windows.Automation.AutomationElement]::RootElement
$condition = [Windows.Automation.Condition]::TrueCondition
$elements = $root.FindAll([Windows.Automation.TreeScope]::Descendants, $condition)
$target = $elements | Where-Object { $_.Current.Name -${match_type === "exact" ? "eq" : "like"} "${match_type === "exact" ? element_name : "*" + element_name + "*"}" } | Select-Object -First 1
if ($target) {
    $r = $target.Current.BoundingRectangle
    [PSCustomObject]@{ X = [Math]::Round($r.X + $r.Width/2); Y = [Math]::Round($r.Y + $r.Height/2); Name = $target.Current.Name } | ConvertTo-Json
} else { "NOT_FOUND" }
`;
    const { stdout } = await execa("powershell", ["-Command", script], { shell: true });
    if (stdout.trim() === "NOT_FOUND" || !stdout.trim()) {
      return `❌ Element "${element_name}" not found. Try inspect_ui to see available elements.`;
    }

    const el = JSON.parse(stdout);
    await mouse.move(straightTo(new Point(el.X, el.Y)));

    if (action === "click")        await mouse.click(Button.LEFT);
    if (action === "double_click") await mouse.doubleClick(Button.LEFT);
    if (action === "right_click")  await mouse.click(Button.RIGHT);

    return `✓ Clicked "${el.Name}" at (${el.X}, ${el.Y})`;
  },
};

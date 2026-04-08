import { z } from "zod";
import { execa } from "execa";

export const inspectUITool: any = {
  description: `Inspect UI elements of the currently active window on Windows.
Returns a list of interactive elements (buttons, inputs, etc.) with their names and descriptions.
Use this to find EXACT locations of buttons or input fields on the screen.`,

  parameters: z.object({
    depth: z.number().optional().default(2).describe("How deep to search the UI tree (default 2 for speed)"),
  }),

  execute: async (args: any) => {
    const { depth = 2 } = args;

    // PowerShell script to get UI Automation elements
    // This is a simplified version targeting common interactive elements
    const script = `
Add-Type -AssemblyName UIAutomationClient
$activeWindow = [Windows.Automation.AutomationElement]::FocusedElement
if (!$activeWindow) { 
    $activeWindow = [Windows.Automation.AutomationElement]::RootElement.FindFirst([Windows.Automation.TreeScope]::Children, [Windows.Automation.PropertyCondition]::TrueCondition)
}

$condition = New-Object Windows.Automation.OrCondition(
    (New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty, [Windows.Automation.ControlType]::Button)),
    (New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty, [Windows.Automation.ControlType]::Edit)),
    (New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty, [Windows.Automation.ControlType]::MenuItem)),
    (New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty, [Windows.Automation.ControlType]::Hyperlink))
)

$elements = $activeWindow.FindAll([Windows.Automation.TreeScope]::Descendants, $condition)
$results = @()

foreach ($el in $elements) {
    try {
        $rect = $el.Current.BoundingRectangle
        $results += [PSCustomObject]@{
            Name = $el.Current.Name
            Type = $el.Current.ControlType.ProgrammaticName.Replace("ControlType.", "")
            X = [Math]::Round($rect.X + ($rect.Width / 2))
            Y = [Math]::Round($rect.Y + ($rect.Height / 2))
            Width = $rect.Width
            Height = $rect.Height
        }
    } catch {}
}

$results | ConvertTo-Json
`;

    try {
      const { stdout } = await execa("powershell", ["-Command", script], { shell: true });
      if (!stdout || stdout.trim() === "") return "No interactive elements found in the active window.";
      
      const elements = JSON.parse(stdout);
      const list = Array.isArray(elements) ? elements : [elements];
      
      const formatted = list.map((el: any) => 
        `- [${el.Type}] "${el.Name}": at (${el.X}, ${el.Y}) [Size: ${el.Width}x${el.Height}]`
      ).join("\n");

      return `Interactive Elements in Active Window:\n${formatted}\n\nTIP: Use 'move_mouse' with these exact coordinates for 100% accuracy.`;
    } catch (e: any) {
      return `UI Inspection failed. It may not be supported for this app. Error: ${e.message}`;
    }
  },
};

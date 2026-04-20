import fs from "fs-extra";
import path from "path";

export async function appendHiruMD(root: string, content: string) {
   const mdPath = path.join(root, "OPENHIRU.md");
   let existing = "";
   try {
       existing = await fs.readFile(mdPath, "utf-8");
   } catch(e) {
       // file doesn't exist yet
   }
   
   const newContent = existing ? `${existing}\n\n- ${content}` : `# OPENHIRU.md - Project Memory\n\n- ${content}`;
   await fs.writeFile(mdPath, newContent, "utf-8");
}

export async function clearHiruMD(root: string) {
   const mdPath = path.join(root, "OPENHIRU.md");
   await fs.writeFile(mdPath, "# OPENHIRU.md - Project Memory\n", "utf-8");
}

export async function readHiruMD(root: string): Promise<string> {
   const mdPath = path.join(root, "OPENHIRU.md");
   try {
       return await fs.readFile(mdPath, "utf-8");
   } catch (e) {
       return "No project memory found.";
   }
}

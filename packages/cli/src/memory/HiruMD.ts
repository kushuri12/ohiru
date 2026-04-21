import fs from "fs-extra";
import { getProjectMemoryPath } from "../utils/paths.js";

export async function appendHiruMD(root: string, content: string) {
   const mdPath = getProjectMemoryPath(root);
   let existing = "";
   try {
       existing = await fs.readFile(mdPath, "utf-8");
   } catch(e) {
       // file doesn't exist yet
   }
   
   const newContent = existing ? `${existing}\n\n- ${content}` : `# Project Memory - ${root}\n\n- ${content}`;
   await fs.writeFile(mdPath, newContent, "utf-8");
}

export async function clearHiruMD(root: string) {
   const mdPath = getProjectMemoryPath(root);
   await fs.writeFile(mdPath, `# Project Memory - ${root}\n`, "utf-8");
}

export async function readHiruMD(root: string): Promise<string> {
   const mdPath = getProjectMemoryPath(root);
   try {
       return await fs.readFile(mdPath, "utf-8");
   } catch (e) {
       return "No project memory found.";
   }
}

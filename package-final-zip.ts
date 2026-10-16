import fs from "fs";
import path from "path";
import JSZip from "jszip";

async function createAuditedZip() {
  console.log("Starting packaging of ANGEL_ENTERPRISES_Civil_Workforce_FINAL_AUDITED.zip...");
  const zip = new JSZip();
  const androidDir = path.resolve(process.cwd(), "android");

  function addFolderToZip(folderPath: string, zipFolder: JSZip) {
    const items = fs.readdirSync(folderPath);
    for (const item of items) {
      // Exclude build caches, computer-specific files, IDE files
      if (
        item === ".gradle" ||
        item === "build" ||
        item === ".idea" ||
        item === "local.properties" ||
        item.endsWith(".iml") ||
        item === ".DS_Store"
      ) {
        continue;
      }

      const fullPath = path.join(folderPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        const subZip = zipFolder.folder(item);
        if (subZip) {
          addFolderToZip(fullPath, subZip);
        }
      } else {
        const fileData = fs.readFileSync(fullPath);
        // Preserve executable permissions on gradlew
        const isExecutable = item === "gradlew";
        zipFolder.file(item, fileData, {
          unixPermissions: isExecutable ? "755" : "644",
        });
      }
    }
  }

  addFolderToZip(androidDir, zip);

  console.log("Generating zip buffer...");
  const content = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  const rootZipPath = path.resolve(process.cwd(), "ANGEL_ENTERPRISES_Civil_Workforce_FINAL_AUDITED.zip");
  const publicZipPath = path.resolve(process.cwd(), "public", "ANGEL_ENTERPRISES_Civil_Workforce_FINAL_AUDITED.zip");

  fs.writeFileSync(rootZipPath, content);
  fs.writeFileSync(publicZipPath, content);

  console.log(`Success! Written to ${rootZipPath} (${(content.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Success! Also written to ${publicZipPath}`);
}

createAuditedZip().catch((err) => {
  console.error("Packaging failed:", err);
  process.exit(1);
});

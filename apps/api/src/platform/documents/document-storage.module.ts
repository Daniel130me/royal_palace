import { Module } from "@nestjs/common";

import { DOCUMENT_STORAGE } from "./document-storage.port.js";
import { S3DocumentStorage } from "./s3-document-storage.js";

/** Owns the single vendor-neutral document storage adapter shared by feature modules. */
@Module({
  providers: [{ provide: DOCUMENT_STORAGE, useClass: S3DocumentStorage }],
  exports: [DOCUMENT_STORAGE],
})
export class DocumentStorageModule {}

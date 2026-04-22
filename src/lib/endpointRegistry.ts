import type { EndpointObject } from "./endpointTypes.js";

// Repo + tree
import { endpoint as reposGet } from "./endpoints/github.repos.get.js";
import { endpoint as reposGetContent } from "./endpoints/github.repos.getContent.js";
import { endpoint as gitGetRef } from "./endpoints/github.git.getRef.js";
import { endpoint as gitGetCommit } from "./endpoints/github.git.getCommit.js";
import { endpoint as gitGetTree } from "./endpoints/github.git.getTree.js";
import { endpoint as gitGetBlob } from "./endpoints/github.git.getBlob.js";

// Writes
import { endpoint as reposCreateOrUpdateFileContents } from "./endpoints/github.repos.createOrUpdateFileContents.js";
import { endpoint as reposDeleteFile } from "./endpoints/github.repos.deleteFile.js";
import { endpoint as gitCreateBlob } from "./endpoints/github.git.createBlob.js";
import { endpoint as gitCreateTree } from "./endpoints/github.git.createTree.js";
import { endpoint as gitCreateCommit } from "./endpoints/github.git.createCommit.js";
import { endpoint as gitUpdateRef } from "./endpoints/github.git.updateRef.js";

// Pull requests
import { endpoint as pullsCreate } from "./endpoints/github.pulls.create.js";
import { endpoint as pullsList } from "./endpoints/github.pulls.list.js";
import { endpoint as pullsGet } from "./endpoints/github.pulls.get.js";
import { endpoint as pullsUpdate } from "./endpoints/github.pulls.update.js";
import { endpoint as pullsMerge } from "./endpoints/github.pulls.merge.js";
import { endpoint as pullsListFiles } from "./endpoints/github.pulls.listFiles.js";
import { endpoint as pullsListCommits } from "./endpoints/github.pulls.listCommits.js";

// Issues
import { endpoint as issuesCreate } from "./endpoints/github.issues.create.js";
import { endpoint as issuesList } from "./endpoints/github.issues.list.js";

export const endpointRegistry = {
  "github.repos.get": reposGet,
  "github.repos.getContent": reposGetContent,
  "github.git.getRef": gitGetRef,
  "github.git.getCommit": gitGetCommit,
  "github.git.getTree": gitGetTree,
  "github.git.getBlob": gitGetBlob,
  "github.repos.createOrUpdateFileContents": reposCreateOrUpdateFileContents,
  "github.repos.deleteFile": reposDeleteFile,
  "github.git.createBlob": gitCreateBlob,
  "github.git.createTree": gitCreateTree,
  "github.git.createCommit": gitCreateCommit,
  "github.git.updateRef": gitUpdateRef,
  "github.pulls.create": pullsCreate,
  "github.pulls.list": pullsList,
  "github.pulls.get": pullsGet,
  "github.pulls.update": pullsUpdate,
  "github.pulls.merge": pullsMerge,
  "github.pulls.listFiles": pullsListFiles,
  "github.pulls.listCommits": pullsListCommits,
  "github.issues.create": issuesCreate,
  "github.issues.list": issuesList,
} satisfies Record<string, EndpointObject>;

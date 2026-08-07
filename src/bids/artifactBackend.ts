import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'proposal-artifacts';

export interface ArtifactIndex {
  projectId: string;
  generatedAt: string;
  manifest: unknown;
  files: { file: string; path: string }[];
}

export interface ArtifactBackend {
  writeSideFile(businessId: string, projectId: string, fileName: string, content: string): Promise<string>;
  persistWorkspace(businessId: string, projectId: string, workspaceDir: string, files: string[], manifest: unknown): Promise<ArtifactIndex>;
  getIndex(projectId: string): Promise<ArtifactIndex | undefined>;
  readFileContent(projectId: string, file: string): Promise<string | undefined>;
}

export class SupabaseArtifactBackend implements ArtifactBackend {
  constructor(private readonly client: SupabaseClient) {}

  private storagePath(businessId: string, projectId: string, file: string): string {
    return `${businessId}/${projectId}/proposal/${file}`;
  }

  async writeSideFile(businessId: string, projectId: string, fileName: string, content: string): Promise<string> {
    const path = `${businessId}/${projectId}/${fileName}`;
    const { error } = await this.client.storage.from(BUCKET).upload(path, content, { contentType: 'application/json', upsert: true });
    if (error) throw new Error(`Failed to upload ${fileName}: ${error.message}`);
    return `supabase-storage:${BUCKET}/${path}`;
  }

  async persistWorkspace(businessId: string, projectId: string, workspaceDir: string, files: string[], manifest: unknown): Promise<ArtifactIndex> {
    const uploaded: { file: string; path: string }[] = [];
    for (const file of files) {
      const bytes = await readFile(join(workspaceDir, file));
      const storagePath = this.storagePath(businessId, projectId, file);
      const { error } = await this.client.storage.from(BUCKET).upload(storagePath, bytes, { upsert: true });
      if (error) throw new Error(`Failed to upload ${file}: ${error.message}`);
      uploaded.push({ file, path: storagePath });
    }
    const generatedAt = new Date().toISOString();
    const { error } = await this.client.from('proposal_artifacts').upsert({
      project_id: projectId, generated_at: generatedAt, manifest, files: uploaded,
    });
    if (error) throw new Error(`Failed to save artifact index for ${projectId}: ${error.message}`);
    return { projectId, generatedAt, manifest, files: uploaded };
  }

  async getIndex(projectId: string): Promise<ArtifactIndex | undefined> {
    const { data, error } = await this.client.from('proposal_artifacts').select('generated_at, manifest, files').eq('project_id', projectId).maybeSingle();
    if (error) throw new Error(`Failed to load artifacts for ${projectId}: ${error.message}`);
    if (!data) return undefined;
    return { projectId, generatedAt: data.generated_at, manifest: data.manifest, files: data.files as { file: string; path: string }[] };
  }

  async readFileContent(projectId: string, file: string): Promise<string | undefined> {
    const index = await this.getIndex(projectId);
    const record = index?.files.find((entry) => entry.file === file);
    if (!record) return undefined;
    const { data, error } = await this.client.storage.from(BUCKET).download(record.path);
    if (error) throw new Error(`Failed to download ${file}: ${error.message}`);
    return await data.text();
  }
}

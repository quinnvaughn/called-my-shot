import {
	DeleteObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
	S3ServiceException,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import type { ImageContentType } from "@called-my-shot/schemas"
import { env } from "../env"

// Uploaded images live in Cloudflare R2, spoken to over its S3-compatible API.
// The browser never sends image bytes through us: it asks for a presigned PUT
// URL, uploads straight to the bucket, then hands the key back to be attached
// (see graphql/types/image). The web app's /graphql proxy only forwards text,
// and there's no reason to route megabytes through Fly to get them to R2.

// Every object is written once under a fresh key and never overwritten, so
// the URL itself is the cache key and browsers and Cloudflare can keep it
// forever.
export const IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable"

// Long enough for a slow phone upload of 2 MB, short enough that a leaked URL
// is useless by the time anyone could act on it.
const UPLOAD_URL_TTL_SECONDS = 5 * 60

type R2Config = {
	accountId: string
	accessKeyId: string
	secretAccessKey: string
	bucket: string
	publicUrl: string
}

function r2Config(): R2Config | null {
	const {
		R2_ACCOUNT_ID,
		R2_ACCESS_KEY_ID,
		R2_SECRET_ACCESS_KEY,
		R2_BUCKET,
		R2_PUBLIC_URL,
	} = env
	if (
		!R2_ACCOUNT_ID ||
		!R2_ACCESS_KEY_ID ||
		!R2_SECRET_ACCESS_KEY ||
		!R2_BUCKET ||
		!R2_PUBLIC_URL
	) {
		return null
	}
	return {
		accountId: R2_ACCOUNT_ID,
		accessKeyId: R2_ACCESS_KEY_ID,
		secretAccessKey: R2_SECRET_ACCESS_KEY,
		bucket: R2_BUCKET,
		publicUrl: R2_PUBLIC_URL,
	}
}

export function isStorageConfigured(): boolean {
	return r2Config() !== null
}

let client: { s3: S3Client; bucket: string } | null = null

function r2(): { s3: S3Client; bucket: string } {
	if (client) return client
	const config = r2Config()
	if (!config) throw new Error("R2 is not configured - see R2_* in env.ts")
	client = {
		s3: new S3Client({
			region: "auto",
			endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
			credentials: {
				accessKeyId: config.accessKeyId,
				secretAccessKey: config.secretAccessKey,
			},
			// The SDK's default checksums a presigned PUT's body at signing time,
			// and there is no body then, so every real upload would fail the
			// checksum of an empty one.
			requestChecksumCalculation: "WHEN_REQUIRED",
		}),
		bucket: config.bucket,
	}
	return client
}

// The public address of a stored image, or null when there isn't one. Also
// null when storage isn't configured, so a local run without R2 renders the
// fallbacks instead of broken images.
export function imageUrl(key: string | null | undefined): string | null {
	if (!key) return null
	const config = r2Config()
	if (!config) return null
	return `${config.publicUrl}/${key}`
}

export type PresignedUpload = {
	url: string
	// Headers the PUT must carry exactly as given. They're part of the
	// signature, so R2 refuses an upload that changes the type, size or
	// caching of what was agreed here.
	headers: { name: string; value: string }[]
}

export async function presignImagePut(
	key: string,
	contentType: ImageContentType,
	contentLength: number,
): Promise<PresignedUpload> {
	const { s3, bucket } = r2()
	const url = await getSignedUrl(
		s3,
		new PutObjectCommand({
			Bucket: bucket,
			Key: key,
			ContentType: contentType,
			ContentLength: contentLength,
			CacheControl: IMAGE_CACHE_CONTROL,
		}),
		{
			expiresIn: UPLOAD_URL_TTL_SECONDS,
			signableHeaders: new Set([
				"content-type",
				"content-length",
				"cache-control",
			]),
		},
	)
	return {
		url,
		headers: [
			{ name: "Content-Type", value: contentType },
			{ name: "Cache-Control", value: IMAGE_CACHE_CONTROL },
		],
	}
}

// A write from the server itself, for images it makes rather than ones a
// browser uploads (the Rushmore portraits in lib/portraits). Same immutable
// caching as an upload, so the key has to be new whenever the bytes are.
export async function putObject(
	key: string,
	body: Uint8Array,
	contentType: string,
): Promise<void> {
	const { s3, bucket } = r2()
	await s3.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: key,
			Body: body,
			ContentType: contentType,
			ContentLength: body.byteLength,
			CacheControl: IMAGE_CACHE_CONTROL,
		}),
	)
}

export type StoredImage = { contentType: string | null; contentLength: number }

// What's actually in the bucket under a key, or null if nothing is. Checked
// before a key is attached, since the client only claims it uploaded.
export async function headImage(key: string): Promise<StoredImage | null> {
	const { s3, bucket } = r2()
	try {
		const head = await s3.send(
			new HeadObjectCommand({ Bucket: bucket, Key: key }),
		)
		return {
			contentType: head.ContentType ?? null,
			contentLength: head.ContentLength ?? 0,
		}
	} catch (error) {
		if (
			error instanceof S3ServiceException &&
			error.$metadata.httpStatusCode === 404
		) {
			return null
		}
		throw error
	}
}

// Best-effort: an image that outlives its row costs a few KB of storage,
// while failing the request that replaced or removed it would leave someone
// unable to change their picture. Logged so a pattern of failures is visible.
export async function deleteImage(
	key: string | null | undefined,
): Promise<void> {
	if (!key || !isStorageConfigured()) return
	try {
		const { s3, bucket } = r2()
		await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
	} catch (error) {
		console.error(`[storage] failed to delete ${key}`, error)
	}
}

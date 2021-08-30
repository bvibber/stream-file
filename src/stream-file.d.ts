declare module "stream-file" {

    export interface StreamFileParams { 
        url: string
        readAhead: boolean
        chunkSize: number
        cacheSize: number
    }

    export default class StreamFile {
        constructor(params: StreamFileParams)

        load(): Promise<void>
        abort(): void
        read(length: number | [number, number]): Promise<Buffer>
        seek(offset: number): Promise<number>
        getBufferedRanges(): [number, number][]

        length: number
        offset: number
        buffering: boolean
        _chunkSize: number
        _cache: {
            seekRead(offset: number): void 
            readBytes(buffer: ArrayBuffer): void
        }
    }
}
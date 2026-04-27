export class ApiError extends Error {
     constructor(
          public readonly status: number,
          public readonly statusText: string,
          messsage?: string,
     ) {
          super(messsage ?? `${status} ${statusText}`);
          this.name = "ApiError";
     }
}

export class StreamError extends Error {
     constructor(message: string) {
          super(message);
          this.name = "StreamError";
     }
}

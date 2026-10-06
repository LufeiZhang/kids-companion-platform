declare module "tls-sig-api-v2" {
  export class Api {
    constructor(sdkAppId: number, secretKey: string);
    genSig(userId: string, expire: number, userBuf?: string | null): string;
  }

  const TLSSigAPIv2: {
    Api: typeof Api;
  };

  export default TLSSigAPIv2;
}

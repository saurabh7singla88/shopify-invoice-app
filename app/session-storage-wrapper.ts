import { Session } from "@shopify/shopify-api";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

/**
 * Custom DynamoDB Session Storage that properly handles Date serialization
 * This replaces @shopify/shopify-app-session-storage-dynamodb which has Date marshalling issues
 */
export class DynamoDBSessionStorageWrapper {
  private client: DynamoDBDocumentClient;
  private tableName: string;
  private shopIndexName: string;

  constructor(options: {
    sessionTableName: string;
    shopIndexName: string;
    config: { region: string };
  }) {
    this.tableName = options.sessionTableName;
    this.shopIndexName = options.shopIndexName;
    
    const dynamoClient = new DynamoDBClient({
      region: options.config.region,
    });
    
    this.client = DynamoDBDocumentClient.from(dynamoClient, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
  }

  /**
   * Convert session to storable format (Date -> ISO string)
   */
  private toStorableSession(session: Session): any {
    const obj: any = session.toObject ? session.toObject() : { ...session };
    
    // Deep convert all Date objects to ISO strings
    const converted = JSON.parse(JSON.stringify(obj, (key, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    }));
    
    return converted;
  }

  /**
   * Convert stored data back to Session (ISO string -> Date)
   */
  private fromStoredSession(data: any): Session {
    // Convert ISO string back to Date
    if (data.expires && typeof data.expires === 'string') {
      data.expires = new Date(data.expires);
    }
    
    return new Session(data);
  }

  async storeSession(session: Session): Promise<boolean> {
    const item = this.toStorableSession(session);
    
    await this.client.send(new PutCommand({
      TableName: this.tableName,
      Item: item,
    }));
    
    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const result = await this.client.send(new GetCommand({
      TableName: this.tableName,
      Key: { id },
    }));
    
    if (!result.Item) {
      return undefined;
    }
    
    return this.fromStoredSession(result.Item);
  }

  async deleteSession(id: string): Promise<boolean> {
    await this.client.send(new DeleteCommand({
      TableName: this.tableName,
      Key: { id },
    }));
    
    return true;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    await Promise.all(ids.map(id => this.deleteSession(id)));
    return true;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const result = await this.client.send(new QueryCommand({
      TableName: this.tableName,
      IndexName: this.shopIndexName,
      KeyConditionExpression: 'shop = :shop',
      ExpressionAttributeValues: {
        ':shop': shop,
      },
    }));
    
    if (!result.Items) {
      return [];
    }
    
    return result.Items.map(item => this.fromStoredSession(item));
  }
}

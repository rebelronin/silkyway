import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import { Token } from '../../db/models/Token';

@Injectable()
export class TokenService {
  constructor(
    @InjectRepository(Token)
    private readonly tokenRepo: EntityRepository<Token>,
  ) {}

  async listTokens(): Promise<Token[]> {
    return this.tokenRepo.findAll();
  }
}

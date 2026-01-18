terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  description = "AWS region for DynamoDB table"
  type        = string
  default     = "us-east-1"
}

variable "table_name" {
  description = "Name of the DynamoDB table for session storage"
  type        = string
  default     = "shopify_sessions"
}

resource "aws_dynamodb_table" "shopify_sessions" {
  name         = var.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "shop"
    type = "S"
  }

  global_secondary_index {
    name            = "shop_index"
    hash_key        = "shop"
    projection_type = "ALL"
  }

  tags = {
    Application = "Shopify-Invoice-App"
    Purpose     = "Session-Storage"
    ManagedBy   = "Terraform"
  }
}

output "table_name" {
  description = "Name of the DynamoDB table"
  value       = aws_dynamodb_table.shopify_sessions.name
}

output "table_arn" {
  description = "ARN of the DynamoDB table"
  value       = aws_dynamodb_table.shopify_sessions.arn
}

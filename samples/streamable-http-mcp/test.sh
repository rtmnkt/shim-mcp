#!/bin/bash

# Test script for streamable HTTP MCP server using curl
# This script provides manual testing capabilities using curl commands

set -e

SERVER_HOST=${HOST:-127.0.0.1}
SERVER_PORT=${PORT:-3000}
SERVER_URL="http://${SERVER_HOST}:${SERVER_PORT}"

echo "🧪 Testing HTTP MCP Server at ${SERVER_URL}"
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}📋 $1${NC}"
}

# Function to check if server is running
check_server() {
    print_info "Checking if server is running..."
    
    if curl -f -s "${SERVER_URL}/health" > /dev/null; then
        print_success "Server is running"
        return 0
    else
        print_error "Server is not running or not responding"
        echo "💡 Please start the server first: npm start"
        exit 1
    fi
}

# Test health endpoint
test_health() {
    print_info "Testing health endpoint..."
    
    response=$(curl -s "${SERVER_URL}/health")
    status=$(echo "$response" | jq -r '.status' 2>/dev/null || echo "error")
    
    if [ "$status" = "healthy" ]; then
        print_success "Health check passed"
        echo "   Response: $response"
    else
        print_error "Health check failed"
        echo "   Response: $response"
        exit 1
    fi
    echo
}

# Test status endpoint
test_status() {
    print_info "Testing status endpoint..."
    
    response=$(curl -s "${SERVER_URL}/status")
    server_name=$(echo "$response" | jq -r '.server.name' 2>/dev/null || echo "error")
    
    if [ "$server_name" != "error" ] && [ "$server_name" != "null" ]; then
        print_success "Status check passed"
        echo "   Server: $(echo "$response" | jq -r '.server.name') v$(echo "$response" | jq -r '.server.version')"
        echo "   Protocol: $(echo "$response" | jq -r '.server.protocol')"
        echo "   Active sessions: $(echo "$response" | jq -r '.sessions.active')"
    else
        print_error "Status check failed"
        echo "   Response: $response"
        exit 1
    fi
    echo
}

# Test MCP streaming endpoint
test_mcp_streaming() {
    print_info "Testing MCP streaming endpoint..."
    
    request_id="test-$(date +%s)"
    request_data="{\"type\":\"request\",\"id\":\"${request_id}\",\"body\":{\"prompt\":\"Hello from curl test!\"}}"
    
    echo "   Sending request: $request_data"
    echo "   Streaming response:"
    
    # Use curl to send request and capture streaming response
    response_file=$(mktemp)
    
    if curl -s -X POST "${SERVER_URL}/mcp" \
        -H "Content-Type: application/json" \
        -d "$request_data" \
        -o "$response_file"; then
        
        # Parse the NDJSON response
        chunk_count=0
        response_end_found=false
        
        while IFS= read -r line; do
            if [ -n "$line" ]; then
                echo "   📦 $line"
                
                # Check message type
                msg_type=$(echo "$line" | jq -r '.type' 2>/dev/null || echo "error")
                msg_id=$(echo "$line" | jq -r '.id' 2>/dev/null || echo "error")
                
                if [ "$msg_id" != "$request_id" ]; then
                    print_error "ID mismatch: expected $request_id, got $msg_id"
                    rm -f "$response_file"
                    exit 1
                fi
                
                case "$msg_type" in
                    "chunk")
                        chunk_count=$((chunk_count + 1))
                        text=$(echo "$line" | jq -r '.body.choices[0].text' 2>/dev/null || echo "")
                        echo "   ✓ Chunk $chunk_count: $text"
                        ;;
                    "response_end")
                        response_end_found=true
                        finish_reason=$(echo "$line" | jq -r '.body.finish_reason' 2>/dev/null || echo "")
                        echo "   ✓ Response completed: $finish_reason"
                        ;;
                    "error")
                        error_message=$(echo "$line" | jq -r '.body.message' 2>/dev/null || echo "Unknown error")
                        print_error "Server error: $error_message"
                        rm -f "$response_file"
                        exit 1
                        ;;
                esac
            fi
        done < "$response_file"
        
        rm -f "$response_file"
        
        if [ $chunk_count -gt 0 ] && [ "$response_end_found" = true ]; then
            print_success "MCP streaming test passed"
            echo "   Total chunks: $chunk_count"
        else
            print_error "MCP streaming test failed: incomplete response"
            exit 1
        fi
    else
        print_error "Failed to send MCP request"
        rm -f "$response_file"
        exit 1
    fi
    echo
}

# Test error handling
test_error_handling() {
    print_info "Testing error handling..."
    
    # Send request with missing prompt to trigger error
    request_data='{"type":"request","id":"error-test","body":{}}'
    
    response=$(curl -s -X POST "${SERVER_URL}/mcp" \
        -H "Content-Type: application/json" \
        -d "$request_data")
    
    msg_type=$(echo "$response" | jq -r '.type' 2>/dev/null || echo "error")
    error_code=$(echo "$response" | jq -r '.body.code' 2>/dev/null || echo "null")
    
    if [ "$msg_type" = "error" ] && [ "$error_code" = "-1" ]; then
        print_success "Error handling works correctly"
        echo "   Error message: $(echo "$response" | jq -r '.body.message')"
    else
        print_error "Error handling test failed"
        echo "   Expected error response, got: $response"
        exit 1
    fi
    echo
}

# Main test execution
main() {
    check_server
    test_health
    test_status
    test_mcp_streaming
    test_error_handling
    
    print_success "All tests passed! 🎉"
}

# Check if jq is available
if ! command -v jq &> /dev/null; then
    print_error "jq is required for JSON parsing but not installed"
    echo "💡 Install jq: sudo apt-get install jq (Ubuntu/Debian) or brew install jq (macOS)"
    exit 1
fi

# Run tests
main
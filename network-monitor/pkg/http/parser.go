package http

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const MaxBodySize = 100 * 1024 // 100KB - increased for better detail capture

type HTTPRequest struct {
	Method        string            `json:"method"`
	Path          string            `json:"path"`
	Query         map[string]string `json:"query"`
	Headers       map[string]string `json:"headers"`
	Body          string            `json:"body,omitempty"`
	BodyTruncated bool              `json:"bodyTruncated,omitempty"` // Indicates if body was cut off
	BodySize      int               `json:"bodySize,omitempty"`      // Original body size
	Status        int               `json:"status,omitempty"`
	LatencyMs     int64             `json:"latency_ms,omitempty"`
	IsRequest     bool              `json:"-"`
	Timestamp     time.Time         `json:"-"`
}

type HTTPParser struct{}

func NewHTTPParser() *HTTPParser {
	return &HTTPParser{}
}

// Parse attempts to parse HTTP request or response from raw bytes
func (hp *HTTPParser) Parse(data []byte) (*HTTPRequest, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("empty data")
	}

	reader := bufio.NewReader(bytes.NewReader(data))

	// Read first line
	firstLine, err := reader.ReadString('\n')
	if err != nil && err != io.EOF {
		return nil, err
	}

	firstLine = strings.TrimSpace(firstLine)

	// Check if it's a request or response
	if strings.HasPrefix(firstLine, "HTTP/") {
		return hp.parseResponse(firstLine, reader, data)
	}

	return hp.parseRequest(firstLine, reader, data)
}

func (hp *HTTPParser) parseRequest(requestLine string, reader *bufio.Reader, data []byte) (*HTTPRequest, error) {
	parts := strings.Split(requestLine, " ")
	if len(parts) < 3 {
		return nil, fmt.Errorf("invalid request line: %s", requestLine)
	}

	req := &HTTPRequest{
		Method:    parts[0],
		IsRequest: true,
		Timestamp: time.Now(),
		Query:     make(map[string]string),
		Headers:   make(map[string]string),
	}

	// Parse URL and query params
	rawURL := parts[1]
	parsedURL, err := url.Parse(rawURL)
	if err == nil {
		req.Path = parsedURL.Path
		for key, values := range parsedURL.Query() {
			if len(values) > 0 {
				req.Query[key] = values[0]
			}
		}
	} else {
		req.Path = rawURL
	}

	// Parse headers
	headers, _ := hp.parseHeaders(reader)
	req.Headers = headers

	// Find body start from raw data (header/body boundary)
	bodyStart := findBodyStart(data)

	// Parse body with Content-Length awareness
	contentLength := 0
	if cl, ok := headers["Content-Length"]; ok {
		if parsed, err := strconv.Atoi(cl); err == nil {
			contentLength = parsed
		}
	}

	// Parse body
	if bodyStart > 0 && bodyStart < len(data) {
		bodyData := data[bodyStart:]
		req.BodySize = len(bodyData)
		if contentLength > 0 && contentLength > len(bodyData) {
			req.BodySize = contentLength // Real size from header
		}

		if len(bodyData) > MaxBodySize {
			bodyData = bodyData[:MaxBodySize]
			req.BodyTruncated = true
		}
		req.Body = string(bodyData)
	}

	return req, nil
}

func (hp *HTTPParser) parseResponse(statusLine string, reader *bufio.Reader, data []byte) (*HTTPRequest, error) {
	parts := strings.Split(statusLine, " ")
	if len(parts) < 3 {
		return nil, fmt.Errorf("invalid status line: %s", statusLine)
	}

	status, err := strconv.Atoi(parts[1])
	if err != nil {
		return nil, fmt.Errorf("invalid status code: %s", parts[1])
	}

	resp := &HTTPRequest{
		Status:    status,
		IsRequest: false,
		Timestamp: time.Now(),
		Headers:   make(map[string]string),
	}

	// Parse headers
	headers, _ := hp.parseHeaders(reader)
	resp.Headers = headers

	// Find body start from raw data (header/body boundary)
	bodyStart := findBodyStart(data)

	// Parse body with Content-Length awareness
	contentLength := 0
	if cl, ok := headers["Content-Length"]; ok {
		if parsed, err := strconv.Atoi(cl); err == nil {
			contentLength = parsed
		}
	}

	// Parse body
	if bodyStart > 0 && bodyStart < len(data) {
		bodyData := data[bodyStart:]
		resp.BodySize = len(bodyData)
		if contentLength > 0 && contentLength > len(bodyData) {
			resp.BodySize = contentLength // Real size from header
		}

		if len(bodyData) > MaxBodySize {
			bodyData = bodyData[:MaxBodySize]
			resp.BodyTruncated = true
		}
		resp.Body = string(bodyData)
	}

	return resp, nil
}

func (hp *HTTPParser) parseHeaders(reader *bufio.Reader) (map[string]string, int) {
	headers := make(map[string]string)

	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			break
		}

		line = strings.TrimSpace(line)
		if line == "" {
			// Empty line indicates end of headers
			break
		}

		parts := strings.SplitN(line, ":", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])
			headers[key] = value
		}
	}

	return headers, 0 // bodyStart calculated from raw data below
}

// findBodyStart locates the \r\n\r\n or \n\n header/body boundary in raw data
func findBodyStart(data []byte) int {
	// Look for \r\n\r\n
	if idx := bytes.Index(data, []byte("\r\n\r\n")); idx >= 0 {
		return idx + 4
	}
	// Fallback: \n\n
	if idx := bytes.Index(data, []byte("\n\n")); idx >= 0 {
		return idx + 2
	}
	return 0
}

// IsHTTP checks if data looks like HTTP
func IsHTTP(data []byte) bool {
	if len(data) < 4 {
		return false
	}

	n := len(data)
	if n > 100 {
		n = 100
	}
	str := string(data[:n])

	// Check for HTTP methods
	methods := []string{"GET ", "POST ", "PUT ", "DELETE ", "PATCH ", "HEAD ", "OPTIONS ", "HTTP/"}
	for _, method := range methods {
		if strings.HasPrefix(str, method) {
			return true
		}
	}

	return false
}

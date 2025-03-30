package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"


	"github.com/gin-gonic/gin"
)

// GeminiRequest represents the request payload from the frontend.
type GeminiRequest struct {
	Prompt string `json:"prompt"`
}

// GeminiResponse represents the response sent back to the frontend.
type GeminiResponse struct {
	Response string `json:"response"`
}

// GeminiHandler processes the incoming request, calls the Gemini API, and returns the result.
func GeminiHandler(c *gin.Context) {
	log.Println("GeminiHandler: Request received")
	var reqBody GeminiRequest
	if err := c.BindJSON(&reqBody); err != nil {
		log.Printf("Error parsing JSON: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request payload"})
		return
	}
	log.Printf("Received prompt: %s", reqBody.Prompt)

	// Build the payload expected by the Google Generative Language API.
	payload := map[string]interface{}{
		"contents": []interface{}{
			map[string]interface{}{
				"parts": []interface{}{
					map[string]interface{}{"text": reqBody.Prompt},
				},
			},
		},
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Error marshalling payload: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to marshal payload"})
		return
	}
	log.Printf("Payload for Gemini API: %s", string(payloadBytes))

	// Get your Gemini API key from an environment variable.
	apiKey := "AIzaSyDIfRD5xQOP2AjExBZ7KqUcJRTF1JB-GPk"	
	if apiKey == "" {
		log.Println("Gemini API key not set")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gemini API key not set"})
		return
	}

	// Construct the URL with the API key.
	geminiURL := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=%s", apiKey)
	log.Printf("Calling Gemini API URL: %s", geminiURL)

	// Create the HTTP POST request.
	apiReq, err := http.NewRequest("POST", geminiURL, bytes.NewBuffer(payloadBytes))
	if err != nil {
		log.Printf("Error creating API request: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create request"})
		return
	}
	apiReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(apiReq)
	if err != nil {
		log.Printf("Error calling Gemini API: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to call Gemini API"})
		return
	}
	defer resp.Body.Close()
	log.Printf("Gemini API responded with status: %d", resp.StatusCode)

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		log.Printf("Error reading Gemini response: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read response"})
		return
	}
	log.Printf("Gemini API response body: %s", string(body))

	// Check for non-200 response status.
	if resp.StatusCode != http.StatusOK {
		log.Printf("Gemini API returned non-200 status %d", resp.StatusCode)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Gemini API error: %d, %s", resp.StatusCode, string(body))})
		return
	}

	// Parse the response into a generic map.
	var rawResp map[string]interface{}
	if err := json.Unmarshal(body, &rawResp); err != nil {
		log.Printf("Error parsing raw Gemini API response: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse Gemini API response", "raw": string(body)})
		return
	}
	log.Printf("Raw Gemini API response: %+v", rawResp)

	// Extract the candidates.
	candidates, ok := rawResp["candidates"].([]interface{})
	if !ok || len(candidates) == 0 {
		log.Printf("No candidates found in response: %+v", rawResp)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "no candidates in Gemini API response", "raw": rawResp})
		return
	}
	
	// The first candidate should contain a "content" field that's an object with a "parts" array.
	candidate, ok := candidates[0].(map[string]interface{})
	if !ok {
		log.Printf("Candidate format unexpected: %+v", candidates[0])
		c.JSON(http.StatusInternalServerError, gin.H{"error": "unexpected candidate format", "raw": candidates[0]})
		return
	}
	
	// Extract the "content" object.
	contentObj, ok := candidate["content"].(map[string]interface{})
	if !ok {
		log.Printf("Candidate missing content object: %+v", candidate)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "candidate missing content object", "raw": candidate})
		return
	}
	
	// Extract the "parts" array from the content object.
	parts, ok := contentObj["parts"].([]interface{})
	if !ok || len(parts) == 0 {
		log.Printf("Content object missing parts: %+v", contentObj)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "content object missing parts", "raw": contentObj})
		return
	}
	
	// Get the text from the first part.
	part, ok := parts[0].(map[string]interface{})
	if !ok {
		log.Printf("Unexpected part format: %+v", parts[0])
		c.JSON(http.StatusInternalServerError, gin.H{"error": "unexpected part format", "raw": parts[0]})
		return
	}
	
	text, ok := part["text"].(string)
	if !ok {
		log.Printf("Part missing text field: %+v", part)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "part missing text field", "raw": part})
		return
	}
	
	log.Printf("AI reply: %s", text)
	c.JSON(http.StatusOK, GeminiResponse{Response: text})
}

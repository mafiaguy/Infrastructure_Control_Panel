"use client"

import { useState, useEffect } from "react"
import { X, Save, AlertTriangle } from "lucide-react"
import { useServicesStore } from "../store/services"
import {
  ElasticLoadBalancingV2Client,
  DescribeRulesCommand,
  ModifyRuleCommand,
  DescribeListenersCommand,
  type Rule,
  type Listener,
  type Action,
  ActionTypeEnum,
} from "@aws-sdk/client-elastic-load-balancing-v2"

interface AlbRulesModalProps {
  albArn: string
  albName: string
  onClose: () => void
  isReadOnly?: boolean
}

interface EditedValues {
  [ruleArn: string]: {
    [field: string]: string
  }
}

// Function to create AWS clients with proper credentials
const createAWSClients = (region: string) => {
  const config = { region }

  return {
    elb: new ElasticLoadBalancingV2Client(config),
  }
}

export function AlbRulesModal({ albArn, albName, onClose, isReadOnly = false }: AlbRulesModalProps) {
  const { selectedRegion } = useServicesStore()
  const [rules, setRules] = useState<Rule[]>([])
  const [listeners, setListeners] = useState<Listener[]>([])
  const [selectedListener, setSelectedListener] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingRule, setEditingRule] = useState<string | null>(null)
  const [editedValues, setEditedValues] = useState<EditedValues>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    loadListeners()
  }, [albArn, selectedRegion])

  useEffect(() => {
    if (selectedListener) {
      loadRules()
    }
  }, [selectedListener])

  const loadListeners = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const clients = createAWSClients(selectedRegion)
      const response = await clients.elb.send(
        new DescribeListenersCommand({
          LoadBalancerArn: albArn,
        }),
      )

      if (response.Listeners && response.Listeners.length > 0) {
        setListeners(response.Listeners)
        setSelectedListener(response.Listeners[0].ListenerArn || null)
      } else {
        setError("No listeners found for this ALB.")
      }
    } catch (err) {
      console.error("Error loading ALB listeners:", err)
      let errorMsg = "Failed to load ALB listeners. Please check your AWS credentials and permissions."

      // Check if the error is an XML response
      if (err instanceof Error && err.message.includes("<?xml")) {
        try {
          // Extract the error message from XML
          const parser = new DOMParser()
          const xmlDoc = parser.parseFromString(err.message, "text/xml")
          const errorElement = xmlDoc.querySelector("Error")
          const requestIdElement = xmlDoc.querySelector("RequestId")

          if (errorElement) {
            const errorCode = errorElement.querySelector("Code")?.textContent || ""
            const errorText = errorElement.querySelector("Message")?.textContent || ""
            const requestId = requestIdElement?.textContent || ""

            errorMsg = `AWS Error: ${errorCode} - ${errorText} (Request ID: ${requestId})`
          }
        } catch (xmlErr) {
          console.error("Error parsing XML error response:", xmlErr)
        }
      }

      setError(errorMsg)
    } finally {
      setIsLoading(false)
    }
  }

  const loadRules = async () => {
    if (!selectedListener) return

    setIsLoading(true)
    setError(null)
    try {
      const clients = createAWSClients(selectedRegion)
      const response = await clients.elb.send(
        new DescribeRulesCommand({
          ListenerArn: selectedListener,
        }),
      )

      if (response.Rules) {
        setRules(response.Rules)
      }
    } catch (err) {
      console.error("Error loading ALB rules:", err)
      let errorMsg = "Failed to load ALB rules. Please check your AWS credentials and permissions."

      // Check if the error is an XML response
      if (err instanceof Error && err.message.includes("<?xml")) {
        try {
          // Extract the error message from XML
          const parser = new DOMParser()
          const xmlDoc = parser.parseFromString(err.message, "text/xml")
          const errorElement = xmlDoc.querySelector("Error")
          const requestIdElement = xmlDoc.querySelector("RequestId")

          if (errorElement) {
            const errorCode = errorElement.querySelector("Code")?.textContent || ""
            const errorText = errorElement.querySelector("Message")?.textContent || ""
            const requestId = requestIdElement?.textContent || ""

            errorMsg = `AWS Error: ${errorCode} - ${errorText} (Request ID: ${requestId})`
          }
        } catch (xmlErr) {
          console.error("Error parsing XML error response:", xmlErr)
        }
      }

      setError(errorMsg)
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditRule = (ruleArn: string) => {
    setEditingRule(ruleArn)
    setEditedValues({})
    setSaveError(null)
    setSaveSuccess(false)
  }

  const handleCancelEdit = () => {
    setEditingRule(null)
    setEditedValues({})
    setSaveError(null)
    setSaveSuccess(false)
  }

  const handleValueChange = (ruleArn: string, field: string, value: string) => {
    setEditedValues((prev) => {
      const currentValues = prev[ruleArn] || {}
      return {
        ...prev,
        [ruleArn]: {
          ...currentValues,
          [field]: value,
        },
      }
    })
  }

  const handleSaveRule = async (ruleArn: string) => {
    setIsSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const clients = createAWSClients(selectedRegion)
      const rule = rules.find((r) => r.RuleArn === ruleArn)

      if (!rule) {
        throw new Error("Rule not found")
      }

      // Only allow editing priority 1 and 2
      const priority = rule.Priority
      if (priority !== "1" && priority !== "2") {
        throw new Error("Only rules with priority 1 or 2 can be edited")
      }

      // Prepare the modified rule
      const ruleValues = editedValues[ruleArn] || {}
      const modifiedActions = rule.Actions?.map((action, index) => {
        if (action.Type === ActionTypeEnum.FIXED_RESPONSE) {
          return {
            Type: ActionTypeEnum.FIXED_RESPONSE,
            FixedResponseConfig: {
              ContentType: ruleValues[`action_${index}_content_type`] || action.FixedResponseConfig?.ContentType,
              StatusCode: ruleValues[`action_${index}_status_code`] || action.FixedResponseConfig?.StatusCode,
              MessageBody: ruleValues[`action_${index}_message_body`] || action.FixedResponseConfig?.MessageBody,
            },
          } as Action
        } else if (action.Type === ActionTypeEnum.FORWARD) {
          return {
            Type: ActionTypeEnum.FORWARD,
            TargetGroupArn: ruleValues[`action_${index}_target_group`] || action.TargetGroupArn,
          } as Action
        }
        return action
      })

      const modifiedConditions = rule.Conditions?.map((condition, index) => ({
        Field: condition.Field,
        Values: ruleValues[`condition_${index}`]?.split(",").map((v) => v.trim()) || condition.Values,
      }))

      const modifiedRule = {
        RuleArn: ruleArn,
        Actions: modifiedActions,
        Conditions: modifiedConditions,
      }

      await clients.elb.send(new ModifyRuleCommand(modifiedRule))

      // Refresh rules after successful save
      await loadRules()
      setEditingRule(null)
      setEditedValues({})
      setSaveSuccess(true)

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSaveSuccess(false)
      }, 3000)
    } catch (err) {
      console.error("Error saving rule:", err)
      let errorMsg = "Failed to save rule changes"

      // Check if the error is an XML response
      if (err instanceof Error && err.message.includes("<?xml")) {
        try {
          // Extract the error message from XML
          const parser = new DOMParser()
          const xmlDoc = parser.parseFromString(err.message, "text/xml")
          const errorElement = xmlDoc.querySelector("Error")
          const requestIdElement = xmlDoc.querySelector("RequestId")

          if (errorElement) {
            const errorCode = errorElement.querySelector("Code")?.textContent || ""
            const errorText = errorElement.querySelector("Message")?.textContent || ""
            const requestId = requestIdElement?.textContent || ""

            errorMsg = `AWS Error: ${errorCode} - ${errorText} (Request ID: ${requestId})`
          }
        } catch (xmlErr) {
          console.error("Error parsing XML error response:", xmlErr)
        }
      } else if (err instanceof Error) {
        errorMsg = err.message
      }

      setSaveError(errorMsg)
    } finally {
      setIsSaving(false)
    }
  }

  const canEditRule = (rule: Rule) => {
    // Only allow editing rules with priority 1 and 2
    const priority = rule.Priority
    return !isReadOnly && (priority === "1" || priority === "2")
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-medium text-gray-900">ALB Rules: {albName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(90vh-8rem)]">
          {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">{error}</div>}

          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <span className="ml-2 text-gray-600">Loading...</span>
            </div>
          ) : listeners.length > 0 ? (
            <>
              <div className="mb-4">
                <label htmlFor="listener" className="block text-sm font-medium text-gray-700 mb-1">
                  Select Listener
                </label>
                <select
                  id="listener"
                  value={selectedListener || ""}
                  onChange={(e) => setSelectedListener(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  {listeners.map((listener) => (
                    <option key={listener.ListenerArn} value={listener.ListenerArn}>
                      Port {listener.Port} - {listener.Protocol}
                    </option>
                  ))}
                </select>
              </div>

              {rules.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No rules found for this listener.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          Priority
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          Conditions
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          Actions
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {rules.map((rule) => (
                        <tr key={rule.RuleArn}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {rule.Priority === "default" ? "Default" : rule.Priority}
                            {!canEditRule(rule) && <span className="ml-2 text-xs text-gray-500">(Read-only)</span>}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {editingRule === rule.RuleArn ? (
                              <div className="space-y-2">
                                {rule.Conditions?.map((condition, index) => (
                                  <div key={index} className="flex items-center space-x-2">
                                    <span className="text-xs font-medium">{condition.Field}:</span>
                                    <input
                                      type="text"
                                      value={
                                        editedValues[rule.RuleArn || ""]?.[`condition_${index}`] ||
                                        condition.Values?.join(", ") ||
                                        ""
                                      }
                                      onChange={(e) =>
                                        handleValueChange(rule.RuleArn || "", `condition_${index}`, e.target.value)
                                      }
                                      className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                                    />
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div>
                                {rule.Conditions?.map((condition, index) => (
                                  <div key={index} className="text-xs">
                                    <span className="font-medium">{condition.Field}:</span>{" "}
                                    {condition.Values?.join(", ")}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {editingRule === rule.RuleArn ? (
                              <div className="space-y-2">
                                {rule.Actions?.map((action, index) => (
                                  <div key={index} className="space-y-2">
                                    <div className="text-xs font-medium">{action.Type}:</div>
                                    {action.Type === "fixed-response" ? (
                                      <>
                                        <div className="flex items-center space-x-2">
                                          <span className="text-xs font-medium">Content Type:</span>
                                          <input
                                            type="text"
                                            value={
                                              editedValues[rule.RuleArn || ""]?.[`action_${index}_content_type`] ||
                                              action.FixedResponseConfig?.ContentType ||
                                              ""
                                            }
                                            onChange={(e) =>
                                              handleValueChange(
                                                rule.RuleArn || "",
                                                `action_${index}_content_type`,
                                                e.target.value,
                                              )
                                            }
                                            className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                                            placeholder="text/html"
                                          />
                                        </div>
                                        <div className="flex items-center space-x-2">
                                          <span className="text-xs font-medium">Status Code:</span>
                                          <input
                                            type="text"
                                            value={
                                              editedValues[rule.RuleArn || ""]?.[`action_${index}_status_code`] ||
                                              action.FixedResponseConfig?.StatusCode ||
                                              ""
                                            }
                                            onChange={(e) =>
                                              handleValueChange(
                                                rule.RuleArn || "",
                                                `action_${index}_status_code`,
                                                e.target.value,
                                              )
                                            }
                                            className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                                            placeholder="200"
                                          />
                                        </div>
                                        <div className="flex items-center space-x-2">
                                          <span className="text-xs font-medium">Message Body:</span>
                                          <textarea
                                            value={
                                              editedValues[rule.RuleArn || ""]?.[`action_${index}_message_body`] ||
                                              action.FixedResponseConfig?.MessageBody ||
                                              ""
                                            }
                                            onChange={(e) =>
                                              handleValueChange(
                                                rule.RuleArn || "",
                                                `action_${index}_message_body`,
                                                e.target.value,
                                              )
                                            }
                                            className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                                            rows={3}
                                            placeholder="Response body content"
                                          />
                                        </div>
                                      </>
                                    ) : (
                                      <div className="flex items-center space-x-2">
                                        <span className="text-xs font-medium">Target Group:</span>
                                        <input
                                          type="text"
                                          value={
                                            editedValues[rule.RuleArn || ""]?.[`action_${index}_target_group`] ||
                                            action.TargetGroupArn ||
                                            ""
                                          }
                                          onChange={(e) =>
                                            handleValueChange(
                                              rule.RuleArn || "",
                                              `action_${index}_target_group`,
                                              e.target.value,
                                            )
                                          }
                                          className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                                        />
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div>
                                {rule.Actions?.map((action, index) => (
                                  <div key={index} className="text-xs space-y-1">
                                    <div className="font-medium">{action.Type}:</div>
                                    {action.Type === "fixed-response" ? (
                                      <>
                                        <div>Content Type: {action.FixedResponseConfig?.ContentType || "Not set"}</div>
                                        <div>Status Code: {action.FixedResponseConfig?.StatusCode || "Not set"}</div>
                                        <div>
                                          Message Body:
                                          <pre className="mt-1 p-2 bg-gray-50 rounded text-xs overflow-x-auto max-h-20">
                                            {action.FixedResponseConfig?.MessageBody || "Not set"}
                                          </pre>
                                        </div>
                                      </>
                                    ) : (
                                      <div>Target Group: {action.TargetGroupArn}</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {editingRule === rule.RuleArn ? (
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleSaveRule(rule.RuleArn || "")}
                                  disabled={isSaving}
                                  className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                                >
                                  <Save className="h-3 w-3 mr-1" />
                                  {isSaving ? "Saving..." : "Save"}
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  disabled={isSaving}
                                  className="inline-flex items-center px-2 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleEditRule(rule.RuleArn || "")}
                                disabled={!canEditRule(rule)}
                                className={`inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded ${
                                  canEditRule(rule)
                                    ? "text-white bg-blue-600 hover:bg-blue-700"
                                    : "text-gray-400 bg-gray-100 cursor-not-allowed"
                                } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
                              >
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">No listeners found for this ALB.</div>
          )}

          {saveError && (
            <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-md flex items-start">
              <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Error saving rule</p>
                <p className="text-sm">{saveError}</p>
              </div>
            </div>
          )}

          {saveSuccess && (
            <div className="mt-4 p-3 bg-green-100 text-green-700 rounded-md">Rule updated successfully!</div>
          )}
        </div>
      </div>
    </div>
  )
}
